"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import knowledge from "../../../../data/knowledge/sources.json";
import { clipObjectPaths, clipPublicUrl, isPlayableClip } from "@/lib/clips";
import { FreshVideoControls } from "@/app/call/[farmId]/incoming-clip";
import { useFreshVideo } from "@/lib/use-fresh-video";
import { getBrowserSupabase } from "@/lib/supabase";

const WINDOW_MS = 10 * 60 * 1000;
const NOISE = new Set(["...", "…", "[noise]", "[inaudible]", "noise"]);
const PROFANITY = /\b(fuck|fucking|shit|damn|ass|asshole|bitch|crap|bastard|dick|piss|cunt)\b/gi;

type CallRow = {
  id: string;
  language: string | null;
  started_at: string;
  ended_at: string | null;
};

type EventPayload = {
  text?: string;
  name?: string;
  topic?: string;
  sources?: Citation[];
  filename?: string;
  file?: string;
  file_id?: string;
};

type EventRow = {
  id: number;
  type: string;
  created_at?: string;
  payload: EventPayload | null;
};

type ClipRow = {
  id: string;
  call_id?: string | null;
  topic: string | null;
  language: string | null;
  video_path: string | null;
  audio_path?: string | null;
  status: string | null;
};

type Citation = {
  title: string;
  publisher: string;
  url: string;
};

type KnowledgeDoc = {
  title: string;
  publisher: string;
  url: string;
  file: string;
  fileId?: string;
};

const STEPS: Array<{
  id: string;
  label: string;
  names: string[];
  icon: "sat" | "weather" | "diag" | "research" | "video";
}> = [
  { id: "greenness", label: "Satellite greenness · Sentinel-2", names: ["get_field_health"], icon: "sat" },
  { id: "weather", label: "Weather · NASA POWER", names: ["get_weather_summary"], icon: "weather" },
  { id: "diagnosis", label: "Diagnosis · grok-4.7", names: ["get_diagnosis"], icon: "diag" },
  { id: "research", label: "Research · IRRI / FAO library", names: ["file_search", "collections_search"], icon: "research" },
  { id: "clip", label: "Video sent · Grok Imagine", names: ["send_guidance_clip"], icon: "video" },
];

export function LiveCallPanel({ farmId }: { farmId: string }) {
  const [call, setCall] = useState<CallRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [clips, setClips] = useState<ClipRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let cancelled = false;

    async function load() {
      const client = getBrowserSupabase();
      if (!client) return;
      const since = new Date(Date.now() - WINDOW_MS).toISOString();
      const { data: calls } = await client
        .from("calls")
        .select("id, language, started_at, ended_at")
        .eq("farm_id", farmId)
        .gte("started_at", since)
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
          .select("id, type, payload, created_at")
          .eq("call_id", latest.id)
          .order("id"),
        client
          .from("clips")
          .select("id, call_id, topic, language, video_path, audio_path, status")
          .eq("call_id", latest.id)
          .order("created_at"),
      ]);
      if (cancelled) return;
      setEvents((eventResult.data as EventRow[] | null) ?? []);
      setClips((clipResult.data as ClipRow[] | null) ?? []);
    }

    void load();
    const poll = window.setInterval(() => void load(), 4000);
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
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [farmId]);

  const visibleCall = call && now - Date.parse(call.started_at) <= WINDOW_MS ? call : null;
  const live = Boolean(visibleCall && !visibleCall.ended_at);
  const ended = Boolean(visibleCall?.ended_at);

  const transcript = useMemo(
    () =>
      events.filter((event) => {
        if (event.type !== "user_transcript" && event.type !== "assistant_transcript") return false;
        const text = event.payload?.text ?? "";
        if (event.type === "user_transcript" && shouldHideUser(text)) return false;
        return Boolean(maskProfanity(text).trim());
      }),
    [events],
  );

  const citations = useMemo(() => citationsFrom(events), [events]);
  const sentClip =
    [...clips].reverse().find((row) => isPlayableClip(row) && row.topic) ?? clipFromEvents(events);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [transcript, visibleCall]);

  const elapsedMs = visibleCall
    ? (visibleCall.ended_at ? Date.parse(visibleCall.ended_at) : now) - Date.parse(visibleCall.started_at)
    : 0;

  return (
    <section className="flex h-full min-h-80 flex-col rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Live call</h2>
        <StatusHeader live={live} ended={ended} elapsedMs={elapsedMs} language={visibleCall?.language} connected={connected} />
      </header>

      {!visibleCall ? (
        <div className="flex flex-1 flex-col justify-center gap-2 py-8 text-center">
          <p className="text-lg font-medium text-white">Waiting for a call</p>
          <p className="text-sm text-slate-400">Scan the QR code to call Master Zhang&apos;s field</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <ol className="space-y-1.5">
            {STEPS.map((step) => {
              const done = stepEvent(events, step.names, step.id === "clip");
              return (
                <li
                  key={step.id}
                  className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm ${
                    done ? "text-slate-100" : "text-slate-500"
                  }`}
                >
                  <StepIcon kind={step.icon} done={Boolean(done)} />
                  <span className="flex-1">{step.label}</span>
                  {done ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-300">
                      <CheckIcon />
                      {formatClock(done.created_at, visibleCall.started_at)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {citations[0] ? (
            <a
              href={citations[0].url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-amber-100 hover:border-amber-400/50"
            >
              <p className="text-xs tracking-wide text-slate-400 uppercase">Cited</p>
              <p className="font-medium text-white">{citations[0].title}</p>
              <p className="text-slate-300">{citations[0].publisher}</p>
            </a>
          ) : null}

          {sentClip?.topic ? (
            <VideoCard
              farmId={farmId}
              callId={sentClip.call_id || visibleCall.id}
              topic={sentClip.topic}
              language={sentClip.language || visibleCall.language || "en"}
              videoPath={sentClip.video_path}
              audioPath={sentClip.audio_path ?? null}
            />
          ) : null}

          <div
            ref={transcriptRef}
            className="flex h-56 flex-col gap-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-2"
          >
            {transcript.length === 0 ? (
              <p className="text-sm text-slate-500">Waiting for the first words.</p>
            ) : (
              transcript.map((event) => {
                const farmer = event.type === "user_transcript";
                return (
                  <div key={event.id} className={farmer ? "self-end max-w-[90%] text-right" : "self-start max-w-[90%]"}>
                    <p className="mb-0.5 text-[10px] tracking-wide text-slate-500 uppercase">
                      {farmer ? "Farmer" : "Orbital Agronomist"}
                    </p>
                    <p
                      className={
                        farmer
                          ? "rounded-2xl bg-sky-900 px-3 py-2 text-sm text-sky-50"
                          : "rounded-2xl bg-slate-800 px-3 py-2 text-sm text-slate-100"
                      }
                    >
                      {maskProfanity(event.payload?.text ?? "")}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function StatusHeader({
  live,
  ended,
  elapsedMs,
  language,
  connected,
}: {
  live: boolean;
  ended: boolean;
  elapsedMs: number;
  language: string | null | undefined;
  connected: boolean;
}) {
  if (live) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        <span className="font-semibold text-red-400">Live</span>
        <span className="tabular-nums text-slate-200">{formatElapsed(elapsedMs)}</span>
        <LangBadge language={language} />
        <span className="text-[10px] tracking-wide text-slate-500 uppercase">{connected ? "Realtime" : "Connecting"}</span>
      </div>
    );
  }
  if (ended) {
    return (
      <p className="text-sm text-slate-300">
        Call ended · {formatElapsed(elapsedMs)}
      </p>
    );
  }
  return <span className="text-xs tracking-wide text-slate-500 uppercase">{connected ? "Realtime on" : "Connecting"}</span>;
}

function LangBadge({ language }: { language: string | null | undefined }) {
  const label = language === "zh" ? "中文" : "EN";
  return (
    <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-200">{label}</span>
  );
}

function VideoCard({
  farmId,
  callId,
  topic,
  language,
  videoPath,
  audioPath,
}: {
  farmId: string;
  callId: string;
  topic: string;
  language: string;
  videoPath: string | null;
  audioPath: string | null;
}) {
  const stored = clipObjectPaths(farmId, topic, language);
  const fresh = useFreshVideo({
    farmId,
    callId,
    topic,
    language,
    videoPath: videoPath && !videoPath.startsWith("pending:") ? videoPath : stored.video_path,
  });
  const url = fresh.videoPath ? clipPublicUrl(fresh.videoPath) : "";
  const narration = audioPath || stored.audio_path;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/80 p-2">
      {url ? (
        <video
          key={url}
          src={url}
          muted
          playsInline
          preload="auto"
          className="h-16 w-24 rounded-lg bg-black object-cover"
          onLoadedData={(event) => {
            const video = event.currentTarget;
            try {
              video.currentTime = 0.12;
            } catch {
              /* first frame is enough */
            }
          }}
        />
      ) : (
        <div className="h-16 w-24 rounded-lg bg-slate-950" />
      )}
      <div className="min-w-0">
        <p className="text-xs tracking-wide text-slate-400 uppercase">Video sent</p>
        <p className="text-sm font-medium text-white">{topicLabel(topic)}</p>
        <FreshVideoControls fresh={fresh} />
        {narration ? <audio src={clipPublicUrl(narration)} preload="none" /> : null}
      </div>
    </div>
  );
}

function stepEvent(events: EventRow[], names: string[], isClip: boolean): EventRow | undefined {
  const match = (event: EventRow) => {
    const name = event.payload?.name;
    return Boolean(name && names.includes(name));
  };
  const results = events.filter((event) => event.type === "tool_result" && match(event));
  if (isClip) {
    const sent = events.filter((event) => event.type === "clip_sent");
    return sent.at(-1) ?? results.at(-1);
  }
  return results.at(-1);
}

function citationsFrom(events: EventRow[]): Citation[] {
  const docs = knowledge.documents as KnowledgeDoc[];
  const found: Citation[] = [];
  const seen = new Set<string>();

  function push(citation: Citation) {
    const key = citation.url || citation.title;
    if (!key || seen.has(key)) return;
    seen.add(key);
    found.push(citation);
  }

  for (const event of events) {
    if (event.type !== "tool_result") continue;
    const name = event.payload?.name;
    if (name && name !== "file_search" && name !== "collections_search") continue;
    const sources = event.payload?.sources;
    if (Array.isArray(sources)) {
      for (const source of sources) {
        const doc = matchDoc(docs, source);
        push(doc ?? { title: source.title, publisher: source.publisher, url: source.url });
      }
    }
    const fileHint = event.payload?.filename ?? event.payload?.file ?? event.payload?.file_id;
    if (typeof fileHint === "string") {
      const doc = docs.find(
        (item) => item.fileId === fileHint || item.file === fileHint || fileHint.endsWith(item.file),
      );
      if (doc) push({ title: doc.title, publisher: doc.publisher, url: doc.url });
    }
  }
  return found;
}

function matchDoc(docs: KnowledgeDoc[], source: Citation & { file?: string; fileId?: string }): Citation | undefined {
  const doc = docs.find(
    (item) =>
      item.title === source.title ||
      item.url === source.url ||
      (source.file && item.file === source.file) ||
      (source.fileId && item.fileId === source.fileId),
  );
  return doc ? { title: doc.title, publisher: doc.publisher, url: doc.url } : undefined;
}

function clipFromEvents(events: EventRow[]): ClipRow | null {
  const sent = [...events].reverse().find((event) => event.type === "clip_sent" && event.payload?.topic);
  if (!sent?.payload?.topic) return null;
  return {
    id: String(sent.id),
    topic: sent.payload.topic,
    language: null,
    video_path: null,
    status: "ready",
  };
}

function shouldHideUser(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return true;
  if (NOISE.has(trimmed.toLowerCase())) return true;
  return false;
}

function maskProfanity(text: string): string {
  return text.replace(PROFANITY, "•••");
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatClock(createdAt: string | undefined, startedAt: string): string {
  const stamp = createdAt ? Date.parse(createdAt) : Date.parse(startedAt);
  if (Number.isNaN(stamp)) return "";
  return new Date(stamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function topicLabel(topic: string): string {
  return topic.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
      <path fill="currentColor" d="M6.4 11.2 3.2 8l1.1-1.1 2.1 2.1 5.3-5.3 1.1 1.1z" />
    </svg>
  );
}

function StepIcon({ kind, done }: { kind: "sat" | "weather" | "diag" | "research" | "video"; done: boolean }) {
  const className = `h-4 w-4 shrink-0 ${done ? "text-amber-300" : "text-slate-600"}`;
  if (kind === "sat") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path fill="currentColor" d="M12 2 9 9H2l6 4.5L5.5 22 12 17l6.5 5L16 13.5 22 9h-7z" />
      </svg>
    );
  }
  if (kind === "weather") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path fill="currentColor" d="M17 18a4 4 0 0 0 .2-8 6 6 0 0 0-11.6 1.6A3.5 3.5 0 0 0 7.5 18Z" />
      </svg>
    );
  }
  if (kind === "diag") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path fill="currentColor" d="M11 2h2v7h7v2h-7v7h-2v-7H4V9h7z" />
      </svg>
    );
  }
  if (kind === "research") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path fill="currentColor" d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12m0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8m5.7 9.3 4 4-1.4 1.4-4-4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="currentColor" d="M4 5h11v10H4zm13 3 5-3v12l-5-3z" />
    </svg>
  );
}
