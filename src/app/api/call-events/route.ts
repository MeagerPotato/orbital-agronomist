import { NextResponse } from "next/server";
import { rejectIfCallExpired, rejectIfCrossOrigin } from "@/lib/request-guard";
import { createServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set([
  "user_transcript",
  "assistant_transcript",
  "tool_call",
  "tool_result",
  "clip_sent",
  "status",
]);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const forbidden = rejectIfCrossOrigin(request);
  if (forbidden) return forbidden;
  const body = (await request.json().catch(() => null)) as {
    callId?: string;
    events?: Array<{ type?: string; payload?: unknown }>;
  } | null;
  const callId = body?.callId ?? "";
  const events = body?.events ?? [];
  if (!UUID.test(callId)) {
    return NextResponse.json({ error: "Invalid call id" }, { status: 400 });
  }
  const expired = await rejectIfCallExpired(callId);
  if (expired) return expired;
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }
  if (events.length > 40) {
    return NextResponse.json({ error: "Too many events" }, { status: 400 });
  }
  for (const event of events) {
    if (!event || !EVENT_TYPES.has(event.type ?? "")) {
      return NextResponse.json({ error: "Bad event type" }, { status: 400 });
    }
  }

  const rows = events.map((event) => ({
    call_id: callId,
    type: event.type,
    payload: event.payload ?? {},
  }));

  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("call_events").insert(rows);
    if (error) {
      console.error("[call-events] insert failed", error.message);
      return NextResponse.json({ error: "Could not store call events" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (error) {
    console.error("[call-events] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not store call events" }, { status: 500 });
  }
}
