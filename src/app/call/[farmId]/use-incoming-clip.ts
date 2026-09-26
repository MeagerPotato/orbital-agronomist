"use client";

import { useEffect, useState } from "react";
import { isPlayableClip } from "@/lib/clips";
import { getBrowserSupabase } from "@/lib/supabase";
import type { IncomingClip } from "./incoming-clip";

export function useIncomingClip(callId: string) {
  const [clip, setClip] = useState<IncomingClip | null>(null);

  useEffect(() => {
    setClip(null);
    if (!callId) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let cancelled = false;

    const client = supabase;
    async function loadLatest() {
      const { data } = await client
        .from("clips")
        .select("id, topic, language, video_path, audio_path, status")
        .eq("call_id", callId)
        .order("created_at", { ascending: false })
        .limit(8);
      const playable = ((data ?? []) as Array<IncomingClip & { status?: string | null }>).find((row) =>
        isPlayableClip(row),
      );
      if (!cancelled && playable) setClip(playable);
    }

    void loadLatest();
    const channel = client
      .channel(`call-clips-${callId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clips",
          filter: `call_id=eq.${callId}`,
        },
        () => {
          void loadLatest();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [callId]);

  return clip;
}
