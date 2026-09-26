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
