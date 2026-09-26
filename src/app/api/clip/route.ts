import { NextResponse } from "next/server";
import { clipObjectPaths } from "@/lib/clips";
import { getFarmConfig } from "@/lib/farms";
import { rejectIfCallExpired, rejectIfCrossOrigin } from "@/lib/request-guard";
import { createServerClient } from "@/lib/supabase-server";
import type { Lang } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Demo mode: attach a pregenerated clip to this call and notify via Realtime.
 */
export async function POST(request: Request) {
  const forbidden = rejectIfCrossOrigin(request);
  if (forbidden) return forbidden;
  const body = (await request.json().catch(() => null)) as {
    farmId?: string;
    callId?: string;
    topic?: string;
    language?: Lang;
    demo?: boolean;
  } | null;
  const farmId = body?.farmId ?? "";
  const callId = body?.callId ?? "";
  const topic = body?.topic ?? "";
  const language = body?.language;
  const config = getFarmConfig(farmId);
  if (!config) return NextResponse.json({ error: "Unknown farm" }, { status: 404 });
  if (!config.clipTopics.includes(topic)) {
    return NextResponse.json({ error: "Unknown clip topic" }, { status: 400 });
  }
  if (!language || !config.profile.languages.includes(language)) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  }
  if (!UUID.test(callId)) {
    return NextResponse.json({ error: "Invalid call id" }, { status: 400 });
  }
  const expired = await rejectIfCallExpired(callId);
  if (expired) return expired;

  const paths = clipObjectPaths(farmId, topic, language);
  const forceDemo =
    body?.demo === true || new URL(request.url).searchParams.get("demo") === "1";

  if (!forceDemo) {
    try {
      await attemptLiveClip();
    } catch (error) {
      console.error("[clip] live generation failed, using pregenerated", error);
    }
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("clips")
      .insert({
        farm_id: farmId,
        call_id: callId,
        topic,
        language,
        video_path: paths.video_path,
        audio_path: paths.audio_path,
        source: "pregenerated",
        status: "ready",
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      console.error("[clip] insert failed", error?.message);
      return NextResponse.json({ error: "Could not record the clip" }, { status: 500 });
    }
    const { error: eventError } = await supabase.from("call_events").insert({
      call_id: callId,
      type: "clip_sent",
      payload: {
        topic,
        language,
        status: "ready",
        clipId: data.id,
        video_path: paths.video_path,
        audio_path: paths.audio_path,
      },
    });
    if (eventError) {
      console.error("[clip] event insert failed", eventError.message);
      return NextResponse.json({ error: "Could not record the clip" }, { status: 500 });
    }
    return NextResponse.json({ status: "sending", id: data.id, ...paths });
  } catch (error) {
    console.error("[clip] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not record the clip" }, { status: 500 });
  }
}

/** Live Imagine generation is not awaited on Vercel. Failure uses the stored clip. */
async function attemptLiveClip(): Promise<void> {
  throw new Error("Live clip generation is not used; delivering the stored clip");
}
