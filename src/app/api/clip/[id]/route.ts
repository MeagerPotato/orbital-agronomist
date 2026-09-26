import { NextResponse } from "next/server";
import { rejectIfCrossOrigin } from "@/lib/request-guard";
import { createServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIVE_LIMIT_MS = 150_000;

type ClipJob = {
  id: string;
  farm_id: string;
  video_path: string | null;
  audio_path: string | null;
  status: string | null;
  created_at: string;
};

/**
 * One status check. When Imagine is done, this request downloads and stores the file.
 * It does not poll or sleep.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const forbidden = rejectIfCrossOrigin(request);
  if (forbidden) return forbidden;
  const { id } = await context.params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Invalid clip id" }, { status: 400 });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ status: "saved" });
  }

  try {
    const supabase = createServerClient();
    const loaded = await supabase
      .from("clips")
      .select("id, farm_id, video_path, audio_path, status, created_at")
      .eq("id", id)
      .maybeSingle();
    const row = loaded.data as ClipJob | null;
    if (loaded.error || !row) {
      return NextResponse.json({ error: "Unknown clip" }, { status: 404 });
    }
    if (row.status === "ready" && row.video_path && !row.video_path.startsWith("pending:")) {
      return NextResponse.json({
        status: "ready",
        video_path: row.video_path,
        audio_path: row.audio_path,
      });
    }
    if (row.status === "saved") {
      return NextResponse.json({ status: "saved" });
    }
    const age = Date.now() - Date.parse(row.created_at);
    if (!Number.isFinite(age) || age > LIVE_LIMIT_MS) {
      await supabase.from("clips").update({ status: "saved" }).eq("id", id);
      return NextResponse.json({ status: "saved" });
    }
    const requestId = row.video_path?.startsWith("pending:")
      ? row.video_path.slice("pending:".length)
      : "";
    if (!requestId) {
      await supabase.from("clips").update({ status: "saved" }).eq("id", id);
      return NextResponse.json({ status: "saved" });
    }

    const upstream = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      console.error("[clip] imagine poll failed", upstream.status, text.slice(0, 300));
      await supabase.from("clips").update({ status: "saved" }).eq("id", id);
      return NextResponse.json({ status: "saved" });
    }
    const payload = JSON.parse(text) as { status?: string; video?: { url?: string } };
    const status = payload.status ?? "pending";
    if (status === "failed" || status === "expired") {
      await supabase.from("clips").update({ status: "saved" }).eq("id", id);
      return NextResponse.json({ status: "saved" });
    }
    if (status !== "done") {
      return NextResponse.json({ status: "pending" });
    }
    const url = payload.video?.url;
    if (!url) {
      await supabase.from("clips").update({ status: "saved" }).eq("id", id);
      return NextResponse.json({ status: "saved" });
    }

    const claim = await supabase
      .from("clips")
      .update({ status: "finalizing" })
      .eq("id", id)
      .eq("status", "generating")
      .select("id");
    if (claim.error || !claim.data?.length) {
      const again = await supabase
        .from("clips")
        .select("video_path, audio_path, status")
        .eq("id", id)
        .maybeSingle();
      const current = again.data as Pick<ClipJob, "video_path" | "audio_path" | "status"> | null;
      if (current?.status === "ready" && current.video_path && !current.video_path.startsWith("pending:")) {
        return NextResponse.json({
          status: "ready",
          video_path: current.video_path,
          audio_path: current.audio_path,
        });
      }
      if (current?.status === "saved") return NextResponse.json({ status: "saved" });
      return NextResponse.json({ status: "pending" });
    }

    try {
      const download = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      if (!download.ok) throw new Error(`download ${download.status}`);
      const bytes = new Uint8Array(await download.arrayBuffer());
      const videoPath = `${row.farm_id}/live/${id}.mp4`;
      const uploaded = await supabase.storage.from("clips").upload(videoPath, bytes, {
        contentType: "video/mp4",
        upsert: true,
      });
      if (uploaded.error) throw new Error(uploaded.error.message);
      const saved = await supabase
        .from("clips")
        .update({ video_path: videoPath, status: "ready", source: "live" })
        .eq("id", id)
        .select("video_path, audio_path")
        .single();
      if (saved.error || !saved.data?.video_path) throw new Error(saved.error?.message ?? "update failed");
      return NextResponse.json({
        status: "ready",
        video_path: saved.data.video_path,
        audio_path: saved.data.audio_path,
      });
    } catch (error) {
      console.error("[clip] live store failed", error instanceof Error ? error.message : error);
      await supabase.from("clips").update({ status: "saved" }).eq("id", id);
      return NextResponse.json({ status: "saved" });
    }
  } catch (error) {
    console.error("[clip] poll failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ status: "saved" });
  }
}
