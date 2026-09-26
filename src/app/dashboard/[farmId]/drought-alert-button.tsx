"use client";

import { useState } from "react";

export function DroughtAlertButton({ farmId }: { farmId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [detail, setDetail] = useState("");

  async function send() {
    setState("sending");
    setDetail("");
    try {
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmId, alert: true }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setDetail(payload.error || "Could not send the alert");
        setState("error");
        return;
      }
      setState("sent");
      window.setTimeout(() => {
        setState((current) => (current === "sent" ? "idle" : current));
      }, 2500);
    } catch {
      setDetail("Could not send the alert");
      setState("error");
    }
  }

  const label =
    state === "sending" ? "Sending…" : state === "sent" ? "Alert sent" : "Send drought alert call";

  return (
    <div className="mt-3">
      <button
        type="button"
        data-testid="send-drought-alert"
        onClick={() => void send()}
        disabled={state === "sending"}
        className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
      >
        {label}
      </button>
      {state === "error" ? <p className="mt-1 text-sm text-red-300">{detail}</p> : null}
    </div>
  );
}
