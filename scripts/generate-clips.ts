/**
 * Pregenerate silent Imagine clips and TTS narration, then upload to Storage.
 *   npx tsx scripts/generate-clips.ts --farm cn-rice-2022 --tts-only
 *   npx tsx scripts/generate-clips.ts --farm cn-rice-2022 --videos-only
 *   npx tsx scripts/generate-clips.ts --farm cn-rice-2022
 */
import path from "node:path";
import { createServerClient } from "../src/lib/supabase-server";
import type { Lang } from "../src/lib/types";
import {
  isRecord,
  loadEnv,
  readJson,
  repoRoot,
} from "./pipeline";

const XAI = "https://api.x.ai/v1";
const MODEL = "grok-imagine-video-1.5";
const POLL_MS = 5_000;
const TIMEOUT_MS = 12 * 60 * 1000;
const VOICE: Record<Lang, "ara" | "celeste"> = { zh: "ara", en: "celeste" };

type ClipFarm = {
  id: string;
  clipTopics: string[];
  languages: Lang[];
  clipPrompt: {
    setting: string;
    farmer: string;
    scenes: Record<string, string>;
  };
  clipNarration: Record<string, Partial<Record<Lang, string>>>;
};

async function main() {
  loadEnv();
  const { farmId, videos, tts } = parseArgs();
  const farms = await readClipFarms();
  const selected = farmId ? farms.filter((farm) => farm.id === farmId) : farms;
  if (farmId && selected.length === 0) {
    throw new Error(`Unknown farm "${farmId}". Known: ${farms.map((farm) => farm.id).join(", ")}`);
  }

  const jobs: Array<Promise<{ storagePath: string; bytes: number }>> = [];
  if (videos) {
    for (const farm of selected) {
      for (const topic of farm.clipTopics) {
        jobs.push(generateAndUploadVideo(farm, topic));
      }
    }
  }
  if (tts) {
    for (const farm of selected) {
      for (const topic of farm.clipTopics) {
        for (const language of farm.languages) {
          jobs.push(generateAndUploadNarration(farm, topic, language));
        }
      }
    }
  }
  if (jobs.length === 0) throw new Error("Nothing to generate. Pass --videos-only, --tts-only, or neither for both.");

  const results = await Promise.all(jobs);
  console.log("\nUploaded:");
  for (const result of results) {
    console.log(`  ${result.storagePath}  (${result.bytes} bytes)`);
  }
}

function parseArgs(): { farmId: string | null; videos: boolean; tts: boolean } {
  const args = process.argv.slice(2);
  let farmId: string | null = null;
  let videos = true;
  let tts = true;
  let modeSet = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--farm") {
      farmId = args[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--videos-only") {
      videos = true;
      tts = false;
      modeSet = true;
      continue;
    }
    if (arg === "--tts-only") {
      videos = false;
      tts = true;
      modeSet = true;
      continue;
    }
    throw new Error("Usage: npx tsx scripts/generate-clips.ts [--farm <id>] [--videos-only|--tts-only]");
  }
  if (!modeSet) {
    videos = true;
    tts = true;
  }
  return { farmId, videos, tts };
}

async function readClipFarms(): Promise<ClipFarm[]> {
  const config = await readJson(path.join(repoRoot, "data", "farms.config.json"));
  if (!isRecord(config) || !Array.isArray(config.farms)) {
    throw new Error("data/farms.config.json must contain a farms array");
  }
  return config.farms.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string" || !Array.isArray(item.clipTopics)) {
      throw new Error(`farms[${index}] is missing id or clipTopics`);
    }
    const clipPrompt = item.clipPrompt;
    if (
      !isRecord(clipPrompt) ||
      typeof clipPrompt.setting !== "string" ||
      typeof clipPrompt.farmer !== "string" ||
      !isRecord(clipPrompt.scenes)
    ) {
      throw new Error(`${item.id}: clipPrompt.setting, farmer, and scenes are required`);
    }
    const scenes: Record<string, string> = {};
    for (const [topic, scene] of Object.entries(clipPrompt.scenes)) {
      if (typeof scene !== "string") throw new Error(`${item.id}: scene ${topic} must be a string`);
      scenes[topic] = scene;
    }
    const clipTopics = item.clipTopics.filter((topic): topic is string => typeof topic === "string");
    const profile = isRecord(item.profile) ? item.profile : {};
    const languages = Array.isArray(profile.languages)
      ? profile.languages.filter((lang): lang is Lang => lang === "zh" || lang === "en")
      : [];
    const clipNarration: Record<string, Partial<Record<Lang, string>>> = {};
    if (isRecord(item.clipNarration)) {
      for (const [topic, texts] of Object.entries(item.clipNarration)) {
        if (!isRecord(texts)) continue;
        clipNarration[topic] = {
          zh: typeof texts.zh === "string" ? texts.zh : undefined,
          en: typeof texts.en === "string" ? texts.en : undefined,
        };
      }
    }
    return {
      id: item.id,
      clipTopics,
      languages,
      clipPrompt: { setting: clipPrompt.setting, farmer: clipPrompt.farmer, scenes },
      clipNarration,
    };
  });
}

function imaginePrompt(farm: ClipFarm, topic: string): string {
  const scene = farm.clipPrompt.scenes[topic];
  if (!scene) throw new Error(`${farm.id}: no clipPrompt.scenes.${topic}`);
  return [
    `Warm hand-painted illustration style, soft natural light, ${farm.clipPrompt.setting}.`,
    `${scene}. ${farm.clipPrompt.farmer} demonstrates the action calmly.`,
    "Vertical composition, gentle camera movement, no text, no captions, no logos.",
  ].join("\n");
}

async function generateAndUploadVideo(farm: ClipFarm, topic: string) {
  const apiKey = requireEnv("XAI_API_KEY");
  const prompt = imaginePrompt(farm, topic);
  console.log(`[${farm.id}/${topic}] starting generation`);
  const requestId = await startGeneration(apiKey, prompt);
  console.log(`[${farm.id}/${topic}] request_id=${requestId}`);
  const url = await pollVideo(apiKey, requestId, farm.id, topic);
  console.log(`[${farm.id}/${topic}] downloading ${url}`);
  const bytes = await download(url);
  const storagePath = `clips/${farm.id}/${topic}.mp4`;
  await uploadObject(`${farm.id}/${topic}.mp4`, bytes, "video/mp4");
  console.log(`[${farm.id}/${topic}] uploaded ${storagePath}`);
  return { storagePath, bytes: bytes.byteLength };
}

async function generateAndUploadNarration(farm: ClipFarm, topic: string, language: Lang) {
  const apiKey = requireEnv("XAI_API_KEY");
  const text = farm.clipNarration[topic]?.[language];
  if (!text) throw new Error(`${farm.id}: missing clipNarration.${topic}.${language}`);
  const voice_id = VOICE[language];
  console.log(`[${farm.id}/${topic}.${language}] tts voice=${voice_id}`);
  const response = await fetch(`${XAI}/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, voice_id, language }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`[${farm.id}/${topic}.${language}] tts ${response.status}: ${detail.slice(0, 400)}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const storagePath = `clips/${farm.id}/${topic}.${language}.mp3`;
  await uploadObject(`${farm.id}/${topic}.${language}.mp3`, bytes, "audio/mpeg");
  console.log(`[${farm.id}/${topic}.${language}] uploaded ${storagePath} (${bytes.byteLength} bytes)`);
  return { storagePath, bytes: bytes.byteLength };
}

async function startGeneration(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch(`${XAI}/videos/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      duration: 10,
      aspect_ratio: "9:16",
      resolution: "720p",
      generate_audio: false,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`video generations ${response.status}: ${text.slice(0, 500)}`);
  }
  const payload = JSON.parse(text) as { request_id?: string };
  if (!payload.request_id) throw new Error(`no request_id in ${text.slice(0, 300)}`);
  return payload.request_id;
}

async function pollVideo(
  apiKey: string,
  requestId: string,
  farmId: string,
  topic: string,
): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    await sleep(POLL_MS);
    const response = await fetch(`${XAI}/videos/${requestId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`[${farmId}/${topic}] poll ${response.status}: ${text.slice(0, 400)}`);
    }
    const payload = JSON.parse(text) as {
      status?: string;
      video?: { url?: string };
    };
    const status = payload.status ?? "unknown";
    console.log(`[${farmId}/${topic}] ${status}`);
    if (status === "done") {
      const url = payload.video?.url;
      if (!url) throw new Error(`[${farmId}/${topic}] done but missing video.url`);
      return url;
    }
    if (status === "failed" || status === "expired") {
      throw new Error(`[${farmId}/${topic}] generation ${status}: ${text.slice(0, 400)}`);
    }
  }
  throw new Error(`[${farmId}/${topic}] timed out after ${TIMEOUT_MS / 1000}s`);
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download ${response.status} ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function uploadObject(objectPath: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.storage.from("clips").upload(objectPath, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`storage upload clips/${objectPath}: ${error.message}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
