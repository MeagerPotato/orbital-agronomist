"use client";

import { useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase";

export type IncomingAlertCall = { callId: string };

const FRESH_MS = 15 * 60 * 1000;

type StatusPayload = {
  alert?: boolean;
  declined?: boolean;
  status?: string;
};

function readPayload(value: unknown): StatusPayload | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as StatusPayload;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return value as StatusPayload;
  return null;
}

function isAlert(payload: StatusPayload | null): boolean {
  return payload?.alert === true;
}

function isHandled(payload: StatusPayload | null): boolean {
  return payload?.declined === true || payload?.status === "started" || payload?.status === "ended";
}

export function useIncomingAlert(farmId: string, enabled: boolean) {
  const [alert, setAlert] = useState<IncomingAlertCall | null>(null);
  const ignored = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let cancelled = false;

    async function consider(callId: string) {
      if (!callId || ignored.current.has(callId)) return;
      const client = getBrowserSupabase();
      if (!client) return;
      const { data: call } = await client
        .from("calls")
        .select("id, farm_id, ended_at, started_at")
        .eq("id", callId)
        .maybeSingle();
      if (cancelled || !call || call.farm_id !== farmId || call.ended_at) return;
      const startedAt = new Date(String(call.started_at)).getTime();
      if (!Number.isFinite(startedAt) || Date.now() - startedAt > FRESH_MS) return;
      const { data: events } = await client
        .from("call_events")
        .select("type, payload")
        .eq("call_id", callId);
      if (cancelled) return;
      const statuses = (events ?? []).filter((event) => event.type === "status");
      const payloads = statuses.map((event) => readPayload(event.payload));
      if (!payloads.some(isAlert) || payloads.some(isHandled)) return;
      if (ignored.current.has(callId)) return;
      setAlert({ callId });
    }

    async function scanOpen() {
      const client = getBrowserSupabase();
      if (!client) return;
      const since = new Date(Date.now() - FRESH_MS).toISOString();
      const { data: calls } = await client
        .from("calls")
        .select("id")
        .eq("farm_id", farmId)
        .is("ended_at", null)
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(3);
      for (const call of calls ?? []) {
        if (cancelled) return;
        await consider(String(call.id));
      }
    }

    void scanOpen();
    const channel = supabase
      .channel(`drought-alert-${farmId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: `farm_id=eq.${farmId}` },
        (payload) => {
          const id = (payload.new as { id?: string }).id;
          if (!id) return;
          void consider(id);
          window.setTimeout(() => {
            if (!cancelled) void consider(id);
          }, 500);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_events" },
        (payload) => {
          const row = payload.new as { call_id?: string; type?: string; payload?: unknown };
          const body = readPayload(row.payload);
          if (row.type === "status" && body?.alert === true && row.call_id) {
            void consider(row.call_id);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [farmId, enabled]);

  function clear(callId: string) {
    ignored.current.add(callId);
    setAlert((current) => (current?.callId === callId ? null : current));
  }

  return { alert, clear };
}
