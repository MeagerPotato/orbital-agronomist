import { NextResponse } from "next/server";
import { clipObjectPaths, imaginePrompt } from "@/lib/clips";
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
    live?: boolean;
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
  if (body?.live === true) {
    return startLiveClip({ farmId, callId, topic, language });
  }
  const expired = await rejectIfCallExpired(callId);
  if (expired) return expired;

  const paths = clipObjectPaths(farmId, topic, language);

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

const XAI_VIDEOS = "https://api.x.ai/v1/videos/generations";

/** Start Imagine and return. The browser polls /api/clip/[id]; this request does not wait. */
async function startLiveClip(input: {
  farmId: string;
  callId: string;
  topic: string;
  language: Lang;
}) {
  const prompt = imaginePrompt(input.farmId, input.topic);
  const apiKey = process.env.XAI_API_KEY;
  if (!prompt || !apiKey) {
    return NextResponse.json({ error: "Video generation is not configured" }, { status: 500 });
  }
  const paths = clipObjectPaths(input.farmId, input.topic, input.language);
  try {
    const supabase = createServerClient();
    const call = await supabase
      .from("calls")
      .select("id, farm_id")
      .eq("id", input.callId)
      .maybeSingle();
    if (call.error || !call.data || call.data.farm_id !== input.farmId) {
      return NextResponse.json({ error: "Unknown call" }, { status: 404 });
    }
    const upstream = await fetch(XAI_VIDEOS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-video-1.5",
        prompt,
        duration: 6,
        aspect_ratio: "9:16",
        resolution: "480p",
        generate_audio: false,
      }),
      cache: "no-store",
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      console.error("[clip] imagine start failed", upstream.status, text.slice(0, 300));
      return NextResponse.json({ error: "Could not start video generation" }, { status: 502 });
    }
    const payload = JSON.parse(text) as { request_id?: string };
    if (!payload.request_id) {
      console.error("[clip] imagine start missing request_id");
      return NextResponse.json({ error: "Could not start video generation" }, { status: 502 });
    }
    const { data, error } = await supabase
      .from("clips")
      .insert({
        farm_id: input.farmId,
        call_id: input.callId,
        topic: input.topic,
        language: input.language,
        video_path: `pending:${payload.request_id}`,
        audio_path: paths.audio_path,
        source: "live",
        status: "generating",
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      console.error("[clip] live row failed", error?.message);
      return NextResponse.json({ error: "Could not start video generation" }, { status: 500 });
    }
    return NextResponse.json({ id: data.id, status: "pending" });
  } catch (error) {
    console.error("[clip] live start failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not start video generation" }, { status: 500 });
  }
}
