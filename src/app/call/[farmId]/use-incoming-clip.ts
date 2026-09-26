"use client";

import { useEffect, useState } from "react";
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

    async function loadLatest() {
      const { data } = await supabase
        .from("clips")
        .select("id, topic, language, video_path, audio_path")
        .eq("call_id", callId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setClip(data as IncomingClip);
    }

    void loadLatest();
    const channel = supabase
      .channel(`call-clips-${callId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "clips",
          filter: `call_id=eq.${callId}`,
        },
        (payload) => {
          const row = payload.new as IncomingClip;
          if (row?.id) setClip(row);
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
