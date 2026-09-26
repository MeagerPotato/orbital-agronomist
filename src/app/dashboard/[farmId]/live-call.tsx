"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase";

type CallRow = {
  id: string;
  language: string | null;
  started_at: string;
  ended_at: string | null;
};

type EventRow = {
  id: number;
  type: string;
  payload: { text?: string; name?: string; topic?: string; callId?: string } | null;
};

type ClipRow = {
  id: string;
  topic: string | null;
  language: string | null;
  video_path: string | null;
  status: string | null;
};

export function LiveCallPanel({ farmId }: { farmId: string }) {
  const [call, setCall] = useState<CallRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [clips, setClips] = useState<ClipRow[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let cancelled = false;

    async function load() {
      const client = getBrowserSupabase();
      if (!client) return;
      const { data: calls } = await client
        .from("calls")
        .select("id, language, started_at, ended_at")
        .eq("farm_id", farmId)
        .order("started_at", { ascending: false })
        .limit(1);
      const latest = (calls?.[0] as CallRow | undefined) ?? null;
      if (cancelled) return;
      setCall(latest);
      if (!latest) {
        setEvents([]);
        setClips([]);
        return;
      }
      const [eventResult, clipResult] = await Promise.all([
        client
          .from("call_events")
          .select("id, type, payload")
          .eq("call_id", latest.id)
          .order("id"),
        client
          .from("clips")
          .select("id, topic, language, video_path, status")
          .eq("call_id", latest.id)
          .order("created_at"),
      ]);
      if (cancelled) return;
      setEvents((eventResult.data as EventRow[] | null) ?? []);
      setClips((clipResult.data as ClipRow[] | null) ?? []);
    }

    void load();
    const channel = supabase
      .channel(`dashboard-${farmId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls", filter: `farm_id=eq.${farmId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_events" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clips" },
        () => void load(),
      )
      .subscribe((status) => {
        if (!cancelled) setConnected(status === "SUBSCRIBED");
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [farmId]);

  const finishedTools = new Set(
    events.filter((event) => event.type === "tool_result").map((event) => event.payload?.name),
  );
  const toolCalls = events.filter((event) => event.type === "tool_call" && event.payload?.name);
  const transcript = events.filter(
    (event) => event.type === "user_transcript" || event.type === "assistant_transcript",
  );
  const sentTopics = [
    ...events.filter((event) => event.type === "clip_sent").map((event) => event.payload?.topic),
    ...clips.map((clip) => clip.topic),
  ].filter((topic): topic is string => Boolean(topic));

  return (
    <section className="flex h-full min-h-80 flex-col rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Live call</h2>
        <span className="text-xs tracking-wide text-slate-400 uppercase">
          {connected ? "Realtime on" : "Connecting"}
          {call ? ` · ${call.language ?? "call"}` : ""}
          {call?.ended_at ? " · ended" : ""}
        </span>
      </header>
      {!call ? (
        <p className="text-slate-400">No call yet. Scan the QR code and call from a phone.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {toolCalls.map((event) => (
              <span
                key={event.id}
                className="rounded-full bg-slate-800 px-3 py-1 text-sm text-amber-200"
              >
                {event.payload?.name} {finishedTools.has(event.payload?.name) ? "✓" : "…"}
              </span>
            ))}
          </div>
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {transcript.length === 0 ? (
              <p className="text-sm text-slate-500">Waiting for the first words.</p>
            ) : (
              transcript.map((event) => (
                <p
                  key={event.id}
                  className={
                    event.type === "user_transcript"
                      ? "self-end max-w-[85%] rounded-2xl bg-sky-900 px-3 py-2 text-sm text-sky-50"
                      : "self-start max-w-[85%] rounded-2xl bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  }
                >
                  {event.payload?.text}
                </p>
              ))
            )}
          </div>
          {sentTopics.length > 0 ? (
            <p className="text-sm text-amber-200">Clip sent: {sentTopics.join(", ")}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
