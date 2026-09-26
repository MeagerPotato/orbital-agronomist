import { formatSpokenDate } from "./farms";
import { FIXTURE_FLAG } from "./fixtures";
import type { CallBundle } from "./farm-data";
import type { FarmDerived, Lang } from "./types";

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

function percentPhrase(pct: number, less: string, more: string): string {
  const rounded = Math.abs(Math.round(pct));
  return `${rounded}% ${pct < 0 ? less : more}`;
}

export function fieldTrend(derived: FarmDerived, baselineYear: number): string {
  const month = percentPhrase(derived.pctChange30d, "less green", "greener");
  const year = percentPhrase(derived.pctChangeVsBaseline, "less green", "greener");
  return `Greenness is about ${month} than last month, and about ${year} than the same time in ${baselineYear}.`;
}

export function weatherTrend(derived: FarmDerived, baselineYear: number): string {
  return `Rain over the last 30 days is ${derived.rain30dMm} mm, versus ${derived.rain30dMmBaseline} mm in ${baselineYear}. Rain over the season window is ${derived.rainWindowMm} mm, versus ${derived.rainWindowMmBaseline} mm in ${baselineYear}. Days reaching 35°C in the last 30 days: ${derived.heatDays35C_30d}. Root-zone wetness is ${derived.rootZoneWetnessNow} now, versus ${derived.rootZoneWetnessBaseline} in ${baselineYear}.`;
}

function flagged<T extends Record<string, unknown>>(bundle: CallBundle, payload: T) {
  if (!bundle.fixture) return payload;
  return { fixture: FIXTURE_FLAG, ...payload };
}

export function createToolHandlers(
  bundle: CallBundle,
  callId: string,
  options: { demo?: boolean } = {},
): Record<string, ToolHandler> {
  const language: Lang = bundle.language;

  return {
    async get_farmer_profile() {
      const profile = bundle.profile;
      return flagged(bundle, {
        farmerName: profile.farmerName,
        farmerNameEn: profile.farmerNameEn,
        fictional: true,
        village: profile.village,
        region: profile.region,
        country: profile.country,
        crop: profile.crop,
        event: profile.event,
        simulatedToday: formatSpokenDate(bundle.simulatedToday, language),
        baselineYear: bundle.baselineYear,
        language,
      });
    },

    async get_field_health() {
      const derived = bundle.derived;
      return flagged(bundle, {
        lastObsDate: formatSpokenDate(bundle.lastObsDate, language),
        pctChange30d: Math.round(derived.pctChange30d),
        pctChangeVsBaseline: Math.round(derived.pctChangeVsBaseline),
        trend: fieldTrend(derived, bundle.baselineYear),
      });
    },

    async get_weather_summary() {
      const derived = bundle.derived;
      return flagged(bundle, {
        rain30dMm: derived.rain30dMm,
        rain30dMmBaseline: derived.rain30dMmBaseline,
        rainWindowMm: derived.rainWindowMm,
        rainWindowMmBaseline: derived.rainWindowMmBaseline,
        heatDays35C_30d: derived.heatDays35C_30d,
        rootZoneWetnessNow: derived.rootZoneWetnessNow,
        rootZoneWetnessBaseline: derived.rootZoneWetnessBaseline,
        baselineYear: bundle.baselineYear,
        summary: weatherTrend(derived, bundle.baselineYear),
      });
    },

    async get_diagnosis() {
      const diagnosis = bundle.diagnosis;
      const summary = diagnosis.summary[language];
      if (!summary) {
        return { error: `No diagnosis in ${language}` };
      }
      return flagged(bundle, {
        status: diagnosis.status,
        severity: diagnosis.severity,
        evidence: diagnosis.evidence
          .map((item) => item[language])
          .filter((line) => line && !line.startsWith("占位")),
        summary,
        actions: diagnosis.actions.map((action) => ({
          topic: action.topic,
          text: action.text[language],
        })),
        caveats: diagnosis.caveats[language],
      });
    },

    async send_guidance_clip(args) {
      const topic = typeof args.topic === "string" ? args.topic : "";
      const clipLanguage = typeof args.language === "string" ? args.language : language;
      if (!bundle.clipTopics.includes(topic)) {
        return { error: "Unknown clip topic" };
      }
      if (!bundle.profile.languages.includes(clipLanguage as Lang)) {
        return { error: "Unsupported clip language" };
      }
      const demo = options.demo === true;
      const body = {
        farmId: bundle.farmId,
        callId,
        topic,
        language: clipLanguage,
        demo,
      };
      let response = await fetch(demo ? "/api/clip?demo=1" : "/api/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        console.error("[tools] /api/clip failed", response.status, "falling back to pregenerated");
        response = await fetch("/api/clip?demo=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, demo: true }),
        });
      }
      if (!response.ok) {
        console.error("[tools] /api/clip pregenerated fallback failed", response.status);
        return { status: "failed", fallback: "pregenerated" };
      }
      return { status: "sending" };
    },
  };
}
