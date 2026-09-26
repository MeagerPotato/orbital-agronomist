import farmsConfig from "../../data/farms.config.json";
import type { FarmConfig, Lang, VoiceTool } from "./types";

const farms = farmsConfig.farms as FarmConfig[];

export function listFarms(): FarmConfig[] {
  return farms;
}

export function getFarmConfig(farmId: string): FarmConfig | undefined {
  return farms.find((farm) => farm.id === farmId);
}

export function voiceFor(language: Lang): "ara" | "celeste" {
  return language === "zh" ? "ara" : "celeste";
}

const ENGLISH_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function languageLabel(language: Lang): string {
  return language === "zh" ? "Mandarin Chinese" : "English";
}

export function cropFor(farm: FarmConfig, language: Lang): string {
  return farm.profile.cropLocalized?.[language] || farm.profile.crop;
}

/** zh: 2022年8月25日. en: August 25, 2022. Other strings pass through. */
export function formatSpokenDate(iso: string, language: Lang): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return iso;
  if (language === "zh") return `${year}年${month}月${day}日`;
  return `${ENGLISH_MONTHS[month - 1]} ${day}, ${year}`;
}

export function greetingFor(farm: FarmConfig, language: Lang, simulatedToday: string): string {
  const scripted = farm.greetings?.[language];
  if (scripted) return scripted;
  const name = language === "zh" ? farm.profile.farmerName : farm.profile.farmerNameEn;
  const crop = cropFor(farm, language);
  const today = formatSpokenDate(simulatedToday, language);
  if (language === "zh") {
    return `${name}，您好。我是天眼农技助手。今天是${today}。我可以根据卫星和天气，说说您这块${crop}田的情况。您想先问什么？`;
  }
  return `Hello ${name}. This is Orbital Agronomist. Today is ${today}. I can tell you what the satellite and the weather show on your ${crop} field. What would you like to know?`;
}

export function instructionsFor(input: {
  farm: FarmConfig;
  language: Lang;
  village: string;
  simulatedToday: string;
  fixture: boolean;
}): string {
  const { farm, language, village, simulatedToday, fixture } = input;
  const { farmerName, region, country } = farm.profile;
  const crop = cropFor(farm, language);
  const today = formatSpokenDate(simulatedToday, language);
  const lines = [
    "# Role",
    "You are Orbital Agronomist (天眼农技助手 in Chinese), a phone assistant for smallholder farmers. You explain what satellites and weather data show about the caller's own field, then give practical, general guidance.",
    "",
    "# Caller",
    `${farmerName}, ${crop} grower in ${village}, ${region}, ${country}. Speak ${languageLabel(language)}. Today is ${today}. When you name the crop, say "${crop}".`,
    "",
    "# How to talk",
    '- Short sentences. Plain words. Say "greenness seen from the satellite" instead of NDVI unless asked.',
    "- One idea per turn. Pause for the caller.",
    `- Use real numbers from tools. Describe greenness only as a percent change versus last month and versus the same time last year, rounded to a whole number ("about 21% less green than last month, and about 32% less green than this time in ${farm.baselineYear}").`,
    "- Never say a raw greenness index aloud. Do not speak numbers like 0.6085, and do not speak ndviNow, ndvi30dAgo, or ndviSameDateBaseline, even if a tool or the diagnosis evidence includes them.",
    `- Say dates naturally. In Chinese, say 2022年8月25日. In English, say August 25, 2022. Today is ${today}. Never read a date as hyphenated digits.`,
    "- Warm and respectful, like a trusted local extension officer.",
    "",
    "# Tools",
    "- Call get_field_health and get_weather_summary before making any claim about the field.",
    "- Call get_diagnosis before giving advice. At most 3 actions, most important first.",
    "- Offer a short video for the top action; call send_guidance_clip only after the caller agrees.",
    "",
    "# Limits",
    "- Never invent numbers. If data is missing or cloudy, say so.",
    "- Guidance is general. Always suggest confirming with the local agricultural extension officer.",
    "- If asked about something unrelated to the farm, answer briefly and return to the field.",
    "",
    "# Critical",
    "When the caller asks about the field, call get_field_health and get_weather_summary before any claim. Call get_diagnosis before any advice. Use only numbers the tools return. For greenness, speak only whole-number percent changes versus last month and versus the same time last year, never the raw index.",
  ];
  if (fixture) {
    lines.push(
      "",
      "# Data status",
      'If a tool result includes "fixture": "FAKE", those figures are placeholders, not the live satellite record. Say that once, in one short sentence, then continue using those figures. Do not invent different numbers.',
    );
  }
  return lines.join("\n");
}

export function toolsFor(farm: FarmConfig): VoiceTool[] {
  const noArgs = { type: "object" as const, properties: {} };
  return [
    {
      type: "function",
      name: "get_farmer_profile",
      description:
        "Get the caller's name, crop, location, and the historical event being replayed. No arguments.",
      parameters: noArgs,
    },
    {
      type: "function",
      name: "get_field_health",
      description:
        "Get satellite greenness for this field: current value, change over 30 days, and change versus the baseline year. No arguments.",
      parameters: noArgs,
    },
    {
      type: "function",
      name: "get_weather_summary",
      description:
        "Get rainfall versus the baseline year, hot days, and root-zone soil wetness for this field. No arguments.",
      parameters: noArgs,
    },
    {
      type: "function",
      name: "get_diagnosis",
      description:
        "Get the field diagnosis and up to three general actions in the caller's language. No arguments.",
      parameters: noArgs,
    },
    {
      type: "function",
      name: "send_guidance_clip",
      description:
        "Send a short illustrated guidance clip. Call only after the caller agrees to a video.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: farm.clipTopics,
            description: "Which guidance clip to send.",
          },
          language: {
            type: "string",
            enum: farm.profile.languages,
            description: "Language of the clip narration.",
          },
        },
        required: ["topic", "language"],
      },
    },
  ];
}
