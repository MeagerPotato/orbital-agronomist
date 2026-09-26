"use client";

import { useEffect, useRef, useState } from "react";
import { droughtAlertHeadline, droughtAlertOpener } from "@/lib/alerts";
import { loadCallBundle, type CallBundle } from "@/lib/farm-data";
import { demoForced, pttForced, writePttParam } from "@/lib/origin";
import { createToolHandlers } from "@/lib/tools";
import type { Lang } from "@/lib/types";
import { VoiceSession, type CallStatus } from "@/lib/voice";
import { IncomingAlert } from "./incoming-alert";
import { IncomingClipCard } from "./incoming-clip";
import { useIncomingAlert } from "./use-incoming-alert";
import { useIncomingClip } from "./use-incoming-clip";

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
  const [ptt, setPtt] = useState(false);
  const [holding, setHolding] = useState(false);
  const sessionRef = useRef<VoiceSession | null>(null);
  const holdingRef = useRef(false);
  const answeringRef = useRef(false);
  const canRing = status === "idle" || status === "ended" || status === "error";
  const ring = useIncomingAlert(farmId, canRing);
  const incomingClip = useIncomingClip(callId);

  useEffect(() => {
    setPtt(pttForced());
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

  async function startCall(existingCallId?: string) {
    if (!bundle || sessionRef.current) return;
    const fresh = (await loadCallBundle(farmId, language)) ?? bundle;
    const opener = existingCallId
      ? droughtAlertOpener(
          fresh.language,
          fresh.cropNames[fresh.language] || fresh.profile.crop,
          fresh.derived.pctChangeVsBaseline,
        )
      : "";
    const sessionBundle = opener
      ? {
          ...fresh,
          greeting: opener,
          instructions: `${fresh.instructions}\n\n# This call\nYou already opened by stating the drought alert. Do not greet again. When the caller responds, continue as usual: use tools before any field claim, then give general guidance.`,
        }
      : fresh;
    setBundle(sessionBundle);
    setError("");
    setLines([]);
    setTools([]);
    setCallId("");
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
      bundle: sessionBundle,
      callId: existingCallId,
      pushToTalk: ptt,
      createHandlers: (id) => createToolHandlers(sessionBundle, id, { demo: demoForced() }),
    });
  }

  function togglePtt() {
    const next = !ptt;
    setPtt(next);
    writePttParam(next);
    sessionRef.current?.setPushToTalk(next);
    if (!next) {
      holdingRef.current = false;
      setHolding(false);
    }
  }

  function setHold(pressed: boolean) {
    if (!ptt || !sessionRef.current) return;
    if (holdingRef.current === pressed) return;
    holdingRef.current = pressed;
    setHolding(pressed);
    sessionRef.current.setTalking(pressed);
  }

  async function acceptAlert() {
    const callIdToAccept = ring.alert?.callId;
    if (!callIdToAccept || answeringRef.current) return;
    answeringRef.current = true;
    ring.clear(callIdToAccept);
    try {
      await fetch("/api/calls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: callIdToAccept, language }),
      });
      await startCall(callIdToAccept);
    } finally {
      answeringRef.current = false;
    }
  }

  async function declineAlert() {
    const callIdToDecline = ring.alert?.callId;
    if (!callIdToDecline) return;
    ring.clear(callIdToDecline);
    await fetch("/api/call-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId: callIdToDecline,
        events: [{ type: "status", payload: { declined: true } }],
      }),
    });
    await fetch("/api/calls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: callIdToDecline }),
    });
  }

  async function reconnect() {
    await sessionRef.current?.reconnect();
  }

  async function hangUp() {
    holdingRef.current = false;
    setHolding(false);
    await sessionRef.current?.hangUp();
    sessionRef.current = null;
  }

  useEffect(() => {
    const live = status !== "idle" && status !== "ended" && status !== "error";
    if (!ptt || !live) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      setHold(true);
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      event.preventDefault();
      setHold(false);
    }
    function onBlur() {
      setHold(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [ptt, status]);

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
  const ringing = Boolean(ring.alert) && !inCall;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 overflow-x-hidden px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">Push to talk</span>
        <button
          type="button"
          data-testid="ptt-toggle"
          aria-pressed={ptt}
          onClick={togglePtt}
          className={`relative h-8 w-14 rounded-full border transition-colors ${
            ptt ? "border-green-800 bg-green-800" : "border-neutral-400 bg-neutral-200 dark:bg-neutral-800"
          }`}
        >
          <span className="sr-only">Push to talk {ptt ? "on" : "off"}</span>
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
              ptt ? "left-7" : "left-0.5"
            }`}
          />
        </button>
      </div>
      {ptt ? (
        <p className="text-xs text-neutral-500">
          Hold the button (or spacebar) to send your voice. Background noise is ignored until you press.
        </p>
      ) : null}

      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Replay of real {bundle.eventName} satellite and weather data. The farmer is fictional.
        Guidance is general; confirm with your local agricultural extension officer.
      </p>

      {ringing ? (
        <IncomingAlert
          headline={droughtAlertHeadline(language)}
          busy={false}
          onAccept={() => void acceptAlert()}
          onDecline={() => void declineAlert()}
        />
      ) : null}

      <p data-testid="call-status" className="text-sm">
        {statusLabel(status, mic, ptt)}
        {callId ? (
          <span data-testid="call-id" className="mt-1 block font-mono text-xs text-neutral-500">
            {callId}
          </span>
        ) : null}
      </p>
      {mic === "denied" ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Microphone access was denied. Allow the mic in the browser, or type your message.
        </p>
      ) : null}
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
        className="flex min-h-0 max-h-[36vh] flex-1 flex-col gap-2 overflow-y-auto rounded-md border p-3"
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

      {incomingClip ? <IncomingClipCard clip={incomingClip} farmId={farmId} callId={callId} /> : null}

      {status === "dropped" ? (
        <button
          type="button"
          onClick={() => void reconnect()}
          className="rounded-full bg-amber-500 px-4 py-4 text-lg text-slate-950"
        >
          Reconnect
        </button>
      ) : null}

      {inCall && ptt ? (
        <button
          type="button"
          data-testid="hold-to-talk"
          aria-pressed={holding}
          className={`select-none rounded-2xl px-4 py-8 text-xl font-semibold touch-none ${
            holding
              ? "bg-green-700 text-white"
              : "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
          }`}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setHold(true);
          }}
          onPointerUp={() => setHold(false)}
          onPointerCancel={() => setHold(false)}
          onLostPointerCapture={() => setHold(false)}
        >
          {holding ? "Listening…" : "Hold to talk"}
        </button>
      ) : null}

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
      ) : ringing ? null : (
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

function statusLabel(status: CallStatus, mic: "unknown" | "on" | "denied", ptt: boolean): string {
  const micNote = mic === "on" ? "Microphone on." : mic === "denied" ? "Microphone unavailable." : "";
  switch (status) {
    case "connecting":
      return `Connecting the call. ${micNote}`;
    case "greeting":
      return `Greeting. ${micNote}`;
    case "listening":
      return ptt ? `Push to talk. ${micNote}` : `Listening. ${micNote}`;
    case "checking":
      return "Checking satellite data…";
    case "speaking":
      return "Speaking.";
    case "dropped":
      return "The voice connection dropped.";
    case "ended":
      return "Call ended.";
    case "error":
      return "The call stopped.";
    default:
      return "Ready to call.";
  }
}
