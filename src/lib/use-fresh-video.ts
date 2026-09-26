"use client";

import { useEffect, useRef, useState } from "react";

const LIMIT_MS = 150_000;
const POLL_MS = 3_000;

export function formatGenerateClock(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function useFreshVideo(input: {
  farmId: string;
  callId: string;
  topic: string;
  language: string;
  videoPath: string;
}) {
  const [phase, setPhase] = useState<"idle" | "generating" | "ready" | "saved">("idle");
  const [seconds, setSeconds] = useState(0);
  const [livePath, setLivePath] = useState<string | null>(null);
  const stop = useRef(false);
  const running = useRef(false);

  useEffect(() => {
    stop.current = false;
    return () => {
      stop.current = true;
    };
  }, []);

  async function generate() {
    if (running.current || !input.callId || !input.topic) return;
    running.current = true;
    setPhase("generating");
    setSeconds(0);
    setLivePath(null);
    const started = Date.now();
    const tick = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    try {
      const response = await fetch("/api/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farmId: input.farmId,
          callId: input.callId,
          topic: input.topic,
          language: input.language,
          live: true,
        }),
      });
      const payload = (await response.json()) as { id?: string };
      if (!response.ok || !payload.id || stop.current) {
        if (!stop.current) setPhase("saved");
        return;
      }
      while (!stop.current && Date.now() - started < LIMIT_MS) {
        await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
        if (stop.current || Date.now() - started >= LIMIT_MS) break;
        const poll = await fetch(`/api/clip/${payload.id}`, { method: "POST" });
        const body = (await poll.json().catch(() => null)) as {
          status?: string;
          video_path?: string;
        } | null;
        if (!poll.ok || !body) continue;
        if (body.status === "ready" && body.video_path) {
          setLivePath(body.video_path);
          setPhase("ready");
          return;
        }
        if (body.status === "saved") {
          setPhase("saved");
          return;
        }
      }
      if (!stop.current) setPhase("saved");
    } catch {
      if (!stop.current) setPhase("saved");
    } finally {
      window.clearInterval(tick);
      running.current = false;
    }
  }

  const note =
    phase === "generating"
      ? `Generating with Grok Imagine… ${formatGenerateClock(seconds)}`
      : phase === "saved"
        ? "Using saved video"
        : null;

  return {
    videoPath: livePath ?? input.videoPath,
    phase,
    note,
    busy: phase === "generating",
    generate,
  };
}
