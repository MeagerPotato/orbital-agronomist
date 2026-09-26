import {
  cropFor,
  getFarmConfig,
  greetingFor,
  instructionsFor,
  toolsFor,
  voiceFor,
} from "./farms";
import { getBrowserSupabase } from "./supabase";
import type { Diagnosis, FarmDerived, FarmProfile, Lang, VoiceTool } from "./types";

export type CallBundle = {
  farmId: string;
  language: Lang;
  voice: "ara" | "celeste";
  greeting: string;
  instructions: string;
  tools: VoiceTool[];
  profile: FarmProfile;
  cropNames: Partial<Record<Lang, string>>;
  derived: FarmDerived;
  diagnosis: Diagnosis;
  simulatedToday: string;
  baselineYear: number;
  lastObsDate: string;
  clipTopics: string[];
  eventName: string;
};

function isRealDerived(value: unknown): value is FarmDerived {
  if (!value || typeof value !== "object") return false;
  const row = value as FarmDerived & { fixture?: string };
  return typeof row.ndviNow === "number" && row.fixture !== "FAKE";
}

export async function loadCallBundle(
  farmId: string,
  language?: Lang,
): Promise<CallBundle | null> {
  const config = getFarmConfig(farmId);
  const supabase = getBrowserSupabase();
  if (!config || !supabase) return null;

  const selected =
    language && config.profile.languages.includes(language)
      ? language
      : config.profile.primaryLanguage;

  try {
    const { data: farmRow, error: farmError } = await supabase
      .from("farms")
      .select("profile, simulated_today, baseline_year, derived")
      .eq("id", farmId)
      .maybeSingle();
    if (farmError) throw new Error(farmError.message);
    const { data: diagnosisRow, error: diagnosisError } = await supabase
      .from("diagnoses")
      .select("content")
      .eq("farm_id", farmId)
      .maybeSingle();
    if (diagnosisError) throw new Error(diagnosisError.message);

    const content = diagnosisRow?.content as Diagnosis | undefined;
    if (!farmRow || !isRealDerived(farmRow.derived) || !content?.summary) return null;

    const simulatedToday = String(farmRow.simulated_today).slice(0, 10);
    const remoteProfile = (farmRow.profile ?? {}) as Partial<FarmProfile>;
    const profile: FarmProfile = {
      village: remoteProfile.village || config.profile.region,
      region: config.profile.region,
      country: config.profile.country,
      lat: remoteProfile.lat ?? 0,
      lon: remoteProfile.lon ?? 0,
      crop: config.profile.crop,
      event: config.profile.event,
      ...remoteProfile,
      id: farmId,
      farmerName: config.profile.farmerName,
      farmerNameEn: config.profile.farmerNameEn,
      fictional: true,
      languages: config.profile.languages,
    };

    const cropNames: Partial<Record<Lang, string>> = {};
    for (const option of config.profile.languages) {
      cropNames[option] = cropFor(config, option);
    }
    profile.crop = cropNames[selected] || profile.crop;
    const village = profile.village || profile.region;

    return {
      farmId,
      language: selected,
      voice: voiceFor(selected),
      greeting: greetingFor(config, selected, simulatedToday),
      instructions: instructionsFor({
        farm: config,
        language: selected,
        village,
        simulatedToday,
        fixture: false,
      }),
      tools: toolsFor(config),
      profile,
      cropNames,
      derived: farmRow.derived as FarmDerived,
      diagnosis: content,
      simulatedToday,
      baselineYear: farmRow.baseline_year as number,
      lastObsDate: simulatedToday,
      clipTopics: config.clipTopics,
      eventName: config.profile.event.name,
    };
  } catch (error) {
    console.error("[farm-data] could not load farm", error instanceof Error ? error.message : error);
    return null;
  }
}
