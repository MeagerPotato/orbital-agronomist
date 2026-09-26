"use client";

import { useEffect, useRef, useState } from "react";
import { clipPublicUrl } from "@/lib/clips";
import { useFreshVideo } from "@/lib/use-fresh-video";

export type IncomingClip = {
  id: string;
  topic: string;
  language: string;
  video_path: string | null;
  audio_path: string | null;
};

export function IncomingClipCard({
  clip,
  farmId,
  callId,
}: {
  clip: IncomingClip;
  farmId: string;
  callId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const fresh = useFreshVideo({
    farmId,
    callId,
    topic: clip.topic,
    language: clip.language,
    videoPath: clip.video_path ?? "",
  });
  const videoUrl = fresh.videoPath ? clipPublicUrl(fresh.videoPath) : "";
  const audioUrl = clip.audio_path ? clipPublicUrl(clip.audio_path) : "";

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    let cancelled = false;
    async function start() {
      const player = video;
      if (!player) return;
      try {
        player.currentTime = 0;
        if (audio) audio.currentTime = 0;
        await Promise.all([player.play(), audio ? audio.play() : Promise.resolve()]);
        if (!cancelled) setNeedsTap(false);
      } catch {
        if (!cancelled) setNeedsTap(true);
      }
    }
    void start();
    return () => {
      cancelled = true;
      video.pause();
      audio?.pause();
    };
  }, [clip.id, videoUrl, audioUrl]);

  async function playTogether() {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    video.currentTime = 0;
    if (audio) audio.currentTime = 0;
    try {
      await Promise.all([video.play(), audio ? audio.play() : Promise.resolve()]);
      setNeedsTap(false);
    } catch (error) {
      console.error("[clip] playback blocked", error);
      setNeedsTap(true);
    }
  }

  return (
    <article
      data-testid="incoming-clip"
      className="overflow-hidden rounded-xl border border-amber-500/40 bg-neutral-950 text-white"
    >
      <p className="px-3 py-2 text-sm font-medium">Video message received</p>
      {videoUrl ? (
        <button type="button" className="relative block w-full" onClick={() => void playTogether()}>
          <video
            ref={videoRef}
            className="max-h-48 w-full bg-black object-contain sm:max-h-80"
            src={videoUrl}
            muted
            playsInline
            onError={() => setNeedsTap(true)}
          />
          {needsTap ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm">
              Tap to play
            </span>
          ) : null}
        </button>
      ) : (
        <p className="px-3 pb-3 text-sm">The clip file is missing.</p>
      )}
      {audioUrl ? <audio ref={audioRef} src={audioUrl} preload="auto" /> : null}
      <FreshVideoControls fresh={fresh} />
    </article>
  );
}

export function FreshVideoControls({
  fresh,
}: {
  fresh: ReturnType<typeof useFreshVideo>;
}) {
  return (
    <div className="space-y-1 px-3 py-2">
      <button
        type="button"
        data-testid="generate-fresh-video"
        disabled={fresh.busy}
        onClick={() => void fresh.generate()}
        className="rounded-full border border-white/40 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        Generate a fresh video
      </button>
      {fresh.note ? (
        <p data-testid="fresh-video-status" className="text-sm text-amber-100">
          {fresh.note}
        </p>
      ) : null}
    </div>
  );
}
