/**
 * Hero stills and a silent intro for the landing page.
 *   npx tsx scripts/generate-cover.ts
 *   npx tsx scripts/generate-cover.ts --best 2
 *
 * Four 16:9 images go to clips/brand/hero-1.png … hero-4.png.
 * --best N animates that still into clips/brand/intro.mp4 and copies it to hero.png.
 */
import { createServerClient } from "../src/lib/supabase-server";
import { loadEnv } from "./pipeline";

const XAI = "https://api.x.ai/v1";
const IMAGE_MODEL = "grok-imagine-image-2.0";
const VIDEO_MODEL = "grok-imagine-video-1.5";
const PROMPT =
  "a satellite in orbit above terraced rice paddies at dawn, a thin beam of light connecting it to a farmer holding a basic phone, warm painterly style, no text, no logos";
const VIDEO_PROMPT =
  "Slow camera push-in on this same scene. Keep the satellite, the beam of light, the paddies, and the farmer. Silent. No text, no logos.";

async function main() {
  loadEnv();
  const apiKey = requireEnv("XAI_API_KEY");
  const best = bestIndex();
  if (best === null) {
    const images = await generateImages(apiKey);
    for (let index = 0; index < images.length; index++) {
      const name = `hero-${index + 1}.png`;
      await upload(`brand/${name}`, images[index], "image/png");
      console.log(publicUrl(`brand/${name}`));
    }
    console.log("Pick a variant, then: npx tsx scripts/generate-cover.ts --best <1-4>");
    return;
  }

  const source = publicUrl(`brand/hero-${best}.png`);
  console.log(`animating ${source}`);
  const requestId = await startVideo(apiKey, source);
  console.log(`request_id=${requestId}`);
  const videoUrl = await pollVideo(apiKey, requestId);
  const video = await download(videoUrl);
  await upload("brand/intro.mp4", video, "video/mp4");
  const still = await download(source);
  await upload("brand/hero.png", still, "image/png");
  console.log(publicUrl("brand/intro.mp4"));
  console.log(publicUrl("brand/hero.png"));
}

function bestIndex(): number | null {
  const flag = process.argv.indexOf("--best");
  if (flag === -1) return null;
  const value = Number(process.argv[flag + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 4) {
    throw new Error("--best must be 1, 2, 3, or 4");
  }
  return value;
}

async function generateImages(apiKey: string): Promise<Uint8Array[]> {
  const response = await fetch(`${XAI}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: PROMPT,
      aspect_ratio: "16:9",
      n: 4,
      response_format: "url",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`image generations ${response.status}: ${text.slice(0, 500)}`);
  const payload = JSON.parse(text) as { data?: Array<{ url?: string; b64_json?: string }> };
  const rows = payload.data ?? [];
  if (rows.length < 4) throw new Error(`expected 4 images, got ${rows.length}: ${text.slice(0, 300)}`);
  return Promise.all(rows.slice(0, 4).map((row) => imageBytes(row)));
}

async function imageBytes(row: { url?: string; b64_json?: string }): Promise<Uint8Array> {
  if (row.b64_json) return Uint8Array.from(Buffer.from(row.b64_json, "base64"));
  if (!row.url) throw new Error("image response had neither url nor b64_json");
  return download(row.url);
}

async function startVideo(apiKey: string, imageUrl: string): Promise<string> {
  const response = await fetch(`${XAI}/videos/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VIDEO_MODEL,
      prompt: VIDEO_PROMPT,
      image: { url: imageUrl },
      duration: 6,
      aspect_ratio: "16:9",
      resolution: "720p",
      generate_audio: false,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`video generations ${response.status}: ${text.slice(0, 500)}`);
  const payload = JSON.parse(text) as { request_id?: string };
  if (!payload.request_id) throw new Error(`no request_id in ${text.slice(0, 300)}`);
  return payload.request_id;
}

async function pollVideo(apiKey: string, requestId: string): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < 12 * 60 * 1000) {
    await sleep(5_000);
    const response = await fetch(`${XAI}/videos/${requestId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`video poll ${response.status}: ${text.slice(0, 400)}`);
    const payload = JSON.parse(text) as { status?: string; video?: { url?: string } };
    const status = payload.status ?? "unknown";
    console.log(status);
    if (status === "done") {
      if (!payload.video?.url) throw new Error("done without video.url");
      return payload.video.url;
    }
    if (status === "failed" || status === "expired") {
      throw new Error(`video ${status}: ${text.slice(0, 400)}`);
    }
  }
  throw new Error("video timed out");
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function upload(objectPath: string, bytes: Uint8Array, contentType: string) {
  const supabase = createServerClient();
  const { error } = await supabase.storage.from("clips").upload(objectPath, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`storage upload clips/${objectPath}: ${error.message}`);
}

function publicUrl(objectPath: string): string {
  const base = requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/clips/${objectPath}`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
