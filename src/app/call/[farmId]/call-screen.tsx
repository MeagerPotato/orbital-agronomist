"use client";

import { useEffect, useRef, useState } from "react";
import { loadCallBundle, type CallBundle } from "@/lib/farm-data";
import { createToolHandlers } from "@/lib/tools";
import type { Lang } from "@/lib/types";
import { VoiceSession, type CallStatus } from "@/lib/voice";

type TranscriptLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
};

export function CallScreen({ farmId }: { farmId: string }) {
  const [bundle, setBundle] = useState<CallBundle | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<CallStatus>("idle");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [mic, setMic] = useState<"unknown" | "on" | "denied">("unknown");
  const [error, setError] = useState("");
  const [callId, setCallId] = useState("");
  const [draft, setDraft] = useState("");
  const [language, setLanguage] = useState<Lang>("zh");
  const sessionRef = useRef<VoiceSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCallBundle(farmId).then((loaded) => {
      if (cancelled) return;
      if (!loaded) setLoadError("This farm is not configured.");
      else {
        setBundle(loaded);
        setLanguage(loaded.language);
      }
    });
    return () => {
      cancelled = true;
      void sessionRef.current?.hangUp();
    };
  }, [farmId]);

  function pushLine(role: "user" | "assistant", text: string, final: boolean, itemId: string) {
    setLines((current) => {
      const index = current.findIndex((line) => line.id === itemId);
      const trimmed = text.trim();
      if (!trimmed) {
        if (index < 0) return current;
        return current.filter((line) => line.id !== itemId);
      }
      if (index >= 0) {
        const existing = current[index];
        if (existing.final && !final) return current;
        const next = current.slice();
        next[index] = { ...existing, text: trimmed, final: existing.final || final };
        return next;
      }
      return [...current, { id: itemId, role, text: trimmed, final }];
    });
  }

  async function startCall() {
    if (!bundle || sessionRef.current) return;
    const fresh = (await loadCallBundle(farmId, language)) ?? bundle;
    setBundle(fresh);
    setError("");
    setLines([]);
    setTools([]);
    const session = new VoiceSession({
      onStatus: (next) => {
        setStatus(next);
        if (next === "ended" || next === "error") sessionRef.current = null;
      },
      onTranscript: pushLine,
      onTool: (name, phase) => {
        if (phase === "result") {
          setTools((current) =>
            current.map((chip) => (chip === name ? `${name} ✓` : chip)),
          );
        } else {
          setTools((current) => (current.includes(name) ? current : [...current, name]));
        }
      },
      onChecking: setChecking,
      onMic: setMic,
      onError: setError,
      onCallId: setCallId,
    });
    sessionRef.current = session;
    if (process.env.NODE_ENV === "development") {
      (window as Window & { __muteCallMic?: () => void }).__muteCallMic = () => session.muteMic();
    }
    await session.start({
      bundle: fresh,
      createHandlers: (id) => createToolHandlers(fresh, id),
    });
  }

  async function hangUp() {
    await sessionRef.current?.hangUp();
    sessionRef.current = null;
  }

  function sendDraft() {
    const text = draft.trim();
    if (!text) return;
    sessionRef.current?.sendText(text);
    setDraft("");
  }

  if (loadError) {
    return <p className="p-8 text-center">{loadError}</p>;
  }
  if (!bundle) {
    return <p className="p-8 text-center">Loading the field…</p>;
  }

  const inCall = status !== "idle" && status !== "ended" && status !== "error";
  const canType = status === "listening" || status === "speaking" || status === "checking";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-6">
      <header className="space-y-1">
        <p className="text-xs tracking-widest text-neutral-500 uppercase">Orbital Agronomist</p>
        <h1 className="text-2xl font-semibold">{bundle.profile.farmerName}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {bundle.cropNames[language] || bundle.profile.crop} · {bundle.profile.region} · {language.toUpperCase()}
        </p>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{bundle.eventName}</p>
      </header>

      {bundle.profile.languages.length > 1 ? (
        <div className="flex gap-2" role="group" aria-label="Language">
          {bundle.profile.languages.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={language === option}
              disabled={inCall}
              onClick={() => setLanguage(option)}
              className={`rounded-full border px-3 py-1 text-sm ${
                language === option ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : ""
              }`}
            >
              {option === "zh" ? "中文" : "English"}
            </button>
          ))}
        </div>
      ) : null}

      {bundle.fixture === "FAKE" ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Placeholder field numbers (FAKE) until the real Sentinel-2 and NASA POWER series are
          loaded. {bundle.profile.farmerName} is fictional. Guidance is general.
        </p>
      ) : (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Replay of real {bundle.eventName} satellite and weather data. The farmer is fictional.
          Guidance is general; confirm with your local agricultural extension officer.
        </p>
      )}

      <p data-testid="call-status" className="text-sm">
        {statusLabel(status, mic)}
        {callId ? (
          <span data-testid="call-id" className="mt-1 block font-mono text-xs text-neutral-500">
            {callId}
          </span>
        ) : null}
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {checking ? (
        <p data-testid="checking" className="text-sm font-medium">
          Checking satellite data…
        </p>
      ) : null}

      {tools.length > 0 ? (
        <ul data-testid="tools" className="flex flex-wrap gap-2">
          {tools.map((tool) => (
            <li key={tool} className="rounded-full border px-2 py-1 text-xs">
              {tool}
            </li>
          ))}
        </ul>
      ) : null}

      <div
        data-testid="transcript"
        className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-md border p-3"
        aria-live="polite"
      >
        {lines.length === 0 ? (
          <p className="text-sm text-neutral-500">The call transcript will appear here.</p>
        ) : (
          lines.map((line) => (
            <p
              key={line.id}
              data-testid="transcript-line"
              data-role={line.role}
              className={line.role === "user" ? "text-right" : "text-left"}
            >
              <span className="mb-1 block text-xs text-neutral-500">
                {line.role === "user" ? "Farmer" : "Orbital Agronomist"}
              </span>
              <span className="inline-block rounded-2xl bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-900">
                {line.text}
              </span>
            </p>
          ))
        )}
      </div>

      {inCall ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            sendDraft();
          }}
        >
          <input
            aria-label="Type a message"
            className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
            value={draft}
            placeholder="Or type a message"
            disabled={!canType}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-40"
            disabled={!canType || !draft.trim()}
          >
            Send
          </button>
        </form>
      ) : null}

      {inCall ? (
        <button
          type="button"
          onClick={() => void hangUp()}
          className="rounded-full bg-red-700 px-4 py-4 text-lg text-white"
        >
          Hang up
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void startCall()}
          className="rounded-full bg-green-800 px-4 py-4 text-lg text-white"
        >
          {status === "ended" || status === "error" ? "Call again" : "Start call"}
        </button>
      )}
    </main>
  );
}

function statusLabel(status: CallStatus, mic: "unknown" | "on" | "denied"): string {
  const micNote = mic === "on" ? "Microphone on." : mic === "denied" ? "Microphone unavailable." : "";
  switch (status) {
    case "connecting":
      return `Connecting the call. ${micNote}`;
    case "greeting":
      return `Greeting. ${micNote}`;
    case "listening":
      return `Listening. ${micNote}`;
    case "checking":
      return "Checking satellite data…";
    case "speaking":
      return "Speaking.";
    case "ended":
      return "Call ended.";
    case "error":
      return "The call stopped.";
    default:
      return "Ready to call.";
  }
}
