import { getFarmConfig } from "./farms";

export function clipPublicUrl(objectPath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !objectPath) return "";
  const trimmed = objectPath.replace(/^clips\//, "").replace(/^\/+/, "");
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/clips/${trimmed}`;
}

export function clipObjectPaths(farmId: string, topic: string, language: string) {
  return {
    video_path: `${farmId}/${topic}.mp4`,
    audio_path: `${farmId}/${topic}.${language}.mp3`,
  };
}

/** Prompt for a fresh Imagine clip. Null when this farm has no scene for the topic. */
export function imaginePrompt(farmId: string, topic: string): string | null {
  const farm = getFarmConfig(farmId);
  const scene = farm?.clipPrompt?.scenes[topic];
  if (!farm?.clipPrompt || !scene) return null;
  return [
    `Warm hand-painted illustration style, soft natural light, ${farm.clipPrompt.setting}.`,
    `${scene}. ${farm.clipPrompt.farmer} demonstrates the action calmly.`,
    "Vertical composition, gentle camera movement, no text, no captions, no logos.",
  ].join("\n");
}

export function isPlayableClip(row: { status?: string | null; video_path?: string | null }): boolean {
  if (!row.video_path || row.video_path.startsWith("pending:")) return false;
  return !row.status || row.status === "ready";
}
