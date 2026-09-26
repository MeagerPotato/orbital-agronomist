import { NextResponse } from "next/server";
import { getFarmConfig } from "@/lib/farms";
import { createServerClient } from "@/lib/supabase";
import type { Lang } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Phase 4 records the send. Phase 5 attaches the stored video and narration.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    farmId?: string;
    callId?: string;
    topic?: string;
    language?: Lang;
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

  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("call_events").insert({
      call_id: callId,
      type: "clip_sent",
      payload: { topic, language, status: "sending" },
    });
    if (error) {
      console.error("[clip] event insert failed", error.message);
      return NextResponse.json({ error: "Could not record the clip" }, { status: 500 });
    }
  } catch (error) {
    console.error("[clip] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not record the clip" }, { status: 500 });
  }

  return NextResponse.json({ status: "sending" });
}
