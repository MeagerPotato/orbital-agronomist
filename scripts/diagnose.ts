/**
 * Diagnosis for each farm via Grok structured output.
 *   npx tsx scripts/diagnose.ts --farm cn-rice-2022
 */
import path from "node:path";
import type { Diagnosis, Lang, NdviPoint } from "../src/lib/types";
import {
  addDays,
  farmDir,
  isRecord,
  loadEnv,
  readJson,
  selectedFarms,
  writeJson,
  type PipelineFarm,
} from "./pipeline";

const MODEL = "grok-4.7";
const CHAT_URL = "https://api.x.ai/v1/chat/completions";

type FarmExtras = PipelineFarm & {
  clipTopics?: string[];
  extensionOfficer?: Partial<Record<Lang, string>>;
};

async function main() {
  loadEnv();
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY must be set in .env.local");

  const farms = (await selectedFarms()) as FarmExtras[];
  for (const farm of farms) {
    const topics = farm.clipTopics ?? [];
    if (topics.length === 0) throw new Error(`${farm.id}: clipTopics is empty`);
    const languages = farm.profile.languages;
    const input = await diagnosisInput(farm);
    const diagnosis = await diagnose(apiKey, farm, input, topics, languages);
    const outPath = path.join(farmDir(farm.id), "diagnosis.json");
    await writeJson(outPath, { model: MODEL, ...diagnosis });
    console.log(`${farm.id}: ${diagnosis.status} severity ${diagnosis.severity}`);
    console.log(`en: ${diagnosis.summary.en}`);
    console.log(`zh: ${diagnosis.summary.zh}`);
  }
}

async function diagnosisInput(farm: FarmExtras) {
  const filePath = path.join(farmDir(farm.id), "farm.json");
  const json = await readJson(filePath);
  if (!isRecord(json) || !isRecord(json.derived) || !isRecord(json.ndvi)) {
    throw new Error(`${farm.id}: farm.json is missing derived or ndvi`);
  }
  const event = json.ndvi.event as NdviPoint[];
  const baseline = json.ndvi.baseline as NdviPoint[];
  const derived = json.derived;
  const now = event.find((point) => point.mean === derived.ndviNow);
  const ago = event.find((point) => point.mean === derived.ndvi30dAgo);
  const baselinePoint = baseline.find((point) => point.mean === derived.ndviSameDateBaseline);
  return {
    profile: {
      farmerName: farm.profile.farmerName,
      crop: farm.profile.crop,
      region: farm.profile.region,
      country: farm.profile.country,
      fictional: true,
      event: farm.profile.event,
    },
    simulatedToday: json.simulatedToday,
    baselineYear: json.baselineYear,
    recentDays: 30,
    heatThresholdC: 35,
    recentWindowStart: typeof json.simulatedToday === "string" ? addDays(json.simulatedToday, -29) : null,
    seasonWindow: farm.analysisWindow,
    baselineSeasonWindow: farm.baselineWindow,
    comparisonDates: {
      ndviNow: now?.date ?? null,
      ndvi30dAgo: ago?.date ?? null,
      ndviBaseline: baselinePoint?.date ?? null,
      note: "Baseline NDVI uses the nearest cloud-free observation when the same calendar day was too cloudy to keep.",
    },
    derived,
    ndvi: { event, baseline },
  };
}

async function diagnose(
  apiKey: string,
  farm: FarmExtras,
  input: unknown,
  topics: string[],
  languages: Lang[],
): Promise<Diagnosis> {
  const officer = {
    zh: farm.extensionOfficer?.zh ?? "当地农技站",
    en: farm.extensionOfficer?.en ?? "your local agricultural extension station (农技站)",
  };
  let feedback = "";
  const problems: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const diagnosis = await requestDiagnosis(apiKey, input, topics, languages, officer, feedback);
    problems.splice(0, problems.length, ...validateDiagnosis(diagnosis, input, topics, languages));
    if (problems.length === 0) return diagnosis;
    feedback = problems.join("\n");
    console.error(`${farm.id}: attempt ${attempt} rejected:\n${feedback}`);
  }
  throw new Error(`${farm.id}: diagnosis failed checks:\n${problems.join("\n")}`);
}

async function requestDiagnosis(
  apiKey: string,
  input: unknown,
  topics: string[],
  languages: Lang[],
  officer: Record<Lang, string>,
  feedback: string,
): Promise<Diagnosis> {
  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt(topics, languages, officer),
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
        ...(feedback
          ? [{ role: "user" as const, content: `Rewrite. Fix these problems:\n${feedback}` }]
          : []),
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "diagnosis",
          strict: true,
          schema: diagnosisSchema(topics, languages),
        },
      },
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Grok diagnosis ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Grok diagnosis returned empty content");
  return JSON.parse(content) as Diagnosis;
}

function systemPrompt(topics: string[], languages: Lang[], officer: Record<Lang, string>): string {
  return [
    "You write a field diagnosis for a fictional farmer. The JSON input contains real Sentinel-2 and NASA POWER figures.",
    "Use only numbers that appear in the input. Do not invent measurements, dates, counts, or percentages.",
    "Never state raw greenness index values (numbers like 0.6085). Describe greenness only as rounded whole-number percent changes versus 30 days ago and versus the same time last year.",
    "Write dates naturally. Chinese example: 2022年8月25日. English example: August 25, 2022. Do not write ISO dates like 2022-08-25.",
    "Call the crop 中稻 in Chinese and mid-season rice in English.",
    "Rainfall, heat-day counts, root-zone wetness, and heatThresholdC may be quoted exactly as given. Do not round those.",
    "General agronomy only. Do not name fertilizer rates, pesticide doses, or chemical products.",
    `Write every string in each of these languages: ${languages.join(", ")}. zh is plain spoken Mandarin. en is plain spoken English.`,
    "Summary is 2 or 3 short sentences.",
    "Each evidence item cites at least one allowed number: a rounded greenness percent, a rainfall figure, a heat-day count, or root-zone wetness.",
    `Actions must use exactly these topics, in this order: ${topics.join(", ")}. Each action is 1 or 2 sentences a farmer can follow.`,
    `Caveats must tell the farmer to confirm with ${officer.zh} / ${officer.en} before acting.`,
    "The farmer is fictional. Do not claim anyone visited the field.",
  ].join("\n");
}

function diagnosisSchema(topics: string[], languages: Lang[]) {
  const text = {
    type: "object",
    additionalProperties: false,
    required: languages,
    properties: Object.fromEntries(languages.map((language) => [language, { type: "string" }])),
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["status", "severity", "evidence", "summary", "actions", "caveats"],
    properties: {
      status: {
        type: "string",
        enum: ["healthy", "water_stress", "heat_stress", "water_and_heat_stress", "unclear"],
      },
      severity: { type: "integer", enum: [1, 2, 3] },
      evidence: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: text,
      },
      summary: text,
      actions: {
        type: "array",
        minItems: topics.length,
        maxItems: topics.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["topic", "text"],
          properties: {
            topic: { type: "string", enum: topics },
            text,
          },
        },
      },
      caveats: text,
    },
  };
}

function validateDiagnosis(
  diagnosis: Diagnosis,
  input: unknown,
  topics: string[],
  languages: Lang[],
): string[] {
  const problems: string[] = [];
  if (diagnosis.status === "healthy") {
    problems.push("status healthy contradicts the NDVI drop and rainfall deficit in the input");
  }
  const actionTopics = diagnosis.actions.map((action) => action.topic);
  if (actionTopics.join(",") !== topics.join(",")) {
    problems.push(`actions must be ${topics.join(", ")} in that order`);
  }
  for (const language of languages) {
    if (!diagnosis.summary[language]?.trim()) problems.push(`summary.${language} is empty`);
    if (!diagnosis.caveats[language]?.includes("农技站")) {
      problems.push(`caveats.${language} must mention 农技站`);
    }
    for (const [index, item] of diagnosis.evidence.entries()) {
      if (!item[language]?.trim()) problems.push(`evidence[${index}].${language} is empty`);
    }
    for (const action of diagnosis.actions) {
      if (!action.text[language]?.trim()) problems.push(`action ${action.topic} ${language} is empty`);
    }
  }

  const text = diagnosisText(diagnosis);
  const simulatedToday = isRecord(input) && typeof input.simulatedToday === "string" ? input.simulatedToday : "";
  if (simulatedToday) {
    const spoken = spokenDate(simulatedToday);
    if (!text.zh.includes(spoken.zh)) problems.push(`Chinese must include the date ${spoken.zh}`);
    if (!text.en.includes(spoken.en)) problems.push(`English must include the date ${spoken.en}`);
  }
  if (!text.zh.includes("中稻")) problems.push("Chinese must call the crop 中稻");
  if (!/mid-season rice/i.test(text.en)) problems.push("English must call the crop mid-season rice");
  if (/\d{4}-\d{2}-\d{2}/.test(`${text.zh}\n${text.en}`)) {
    problems.push("write dates in words, not as YYYY-MM-DD");
  }

  const allowed = collectNumbers(input);
  const indexes = indexValues(input);
  const used = collectNumbers({
    evidence: diagnosis.evidence,
    summary: diagnosis.summary,
    actions: diagnosis.actions.map((action) => action.text),
    caveats: diagnosis.caveats,
  });
  for (const value of used) {
    if (indexes.some((index) => sameAtPrecision(value, index)) && !isPercentOrWeather(value, input)) {
      problems.push(`do not state raw greenness index ${value}; use a rounded percent change`);
      continue;
    }
    if (!allowed.some((inputValue) => sameAtPrecision(value, inputValue))) {
      problems.push(`number ${value} is not in the input`);
    }
  }
  return problems;
}

function diagnosisText(diagnosis: Diagnosis): { zh: string; en: string } {
  const chunks = [
    diagnosis.summary.zh,
    diagnosis.summary.en,
    diagnosis.caveats.zh,
    diagnosis.caveats.en,
    ...diagnosis.evidence.flatMap((item) => [item.zh, item.en]),
    ...diagnosis.actions.flatMap((action) => [action.text.zh, action.text.en]),
  ];
  return {
    zh: chunks.filter((item) => item && /[\u4e00-\u9fff]/.test(item)).join("\n"),
    en: chunks.filter((item) => item && /[A-Za-z]/.test(item)).join("\n"),
  };
}

function spokenDate(iso: string): { zh: string; en: string } {
  const [year, month, day] = iso.split("-").map(Number);
  const monthName = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][month - 1];
  return { zh: `${year}年${month}月${day}日`, en: `${monthName} ${day}, ${year}` };
}

function indexValues(input: unknown): number[] {
  if (!isRecord(input) || !isRecord(input.ndvi)) return [];
  const values: number[] = [];
  for (const series of [input.ndvi.event, input.ndvi.baseline]) {
    if (!Array.isArray(series)) continue;
    for (const point of series) {
      if (!isRecord(point)) continue;
      if (typeof point.mean === "number") values.push(point.mean);
      if (typeof point.stdev === "number") values.push(point.stdev);
    }
  }
  return values;
}

function isPercentOrWeather(value: number, input: unknown): boolean {
  if (!isRecord(input) || !isRecord(input.derived)) return false;
  const derived = input.derived;
  const safe = [
    derived.pctChange30d,
    derived.pctChangeVsBaseline,
    derived.rain30dMm,
    derived.rain30dMmBaseline,
    derived.rainWindowMm,
    derived.rainWindowMmBaseline,
    derived.heatDays35C_30d,
    derived.rootZoneWetnessNow,
    derived.rootZoneWetnessBaseline,
  ];
  return safe.some((item) => typeof item === "number" && sameAtPrecision(value, item));
}

function collectNumbers(value: unknown): number[] {
  const found: number[] = [];
  walk(value, found);
  return found;
}

function walk(value: unknown, found: number[]) {
  if (typeof value === "number" && Number.isFinite(value)) {
    found.push(value);
    return;
  }
  if (typeof value === "string") {
    for (const match of value.matchAll(/-?\d+(?:\.\d+)?/g)) found.push(Number(match[0]));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found);
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) walk(item, found);
  }
}

function sameAtPrecision(used: number, input: number): boolean {
  const decimals = decimalPlaces(used);
  const scale = 10 ** decimals;
  const rounded = Math.round(Math.abs(input) * scale) / scale;
  return rounded === Math.abs(used);
}

function decimalPlaces(value: number): number {
  const text = String(value);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
