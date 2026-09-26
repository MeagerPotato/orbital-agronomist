import { FIXTURE_FLAG, getFixture } from "./fixtures";
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
  /** Set when numbers are the local placeholder series. */
  fixture: typeof FIXTURE_FLAG | null;
  eventName: string;
};

function isRealDerived(value: unknown): value is FarmDerived {
  if (!value || typeof value !== "object") return false;
  const row = value as FarmDerived & { fixture?: string };
  return typeof row.ndviNow === "number" && row.fixture !== FIXTURE_FLAG;
}

export async function loadCallBundle(
  farmId: string,
  language?: Lang,
): Promise<CallBundle | null> {
  const config = getFarmConfig(farmId);
  const fixture = getFixture(farmId);
  if (!config || !fixture) return null;

  const selected =
    language && config.profile.languages.includes(language)
      ? language
      : config.profile.primaryLanguage;
  let derived = fixture.derived;
  let diagnosis = fixture.diagnosis;
  let simulatedToday = fixture.simulatedToday;
  let baselineYear = config.baselineYear;
  let lastObsDate = fixture.lastObsDate;
  let profile: FarmProfile = {
    ...fixture.profile,
    farmerName: config.profile.farmerName,
    farmerNameEn: config.profile.farmerNameEn,
    region: config.profile.region,
    country: config.profile.country,
    crop: config.profile.crop,
    languages: config.profile.languages,
    event: config.profile.event,
    village: config.profile.village ?? fixture.profile.village,
  };
  let usingFixture = fixture.placeholder;

  try {
    const supabase = getBrowserSupabase();
    if (supabase) {
      const { data: farmRow } = await supabase
        .from("farms")
        .select("profile, simulated_today, baseline_year, derived")
        .eq("id", farmId)
        .maybeSingle();
      const { data: diagnosisRow } = await supabase
        .from("diagnoses")
        .select("content")
        .eq("farm_id", farmId)
        .maybeSingle();
      const content = diagnosisRow?.content as Diagnosis | undefined;
      if (farmRow && isRealDerived(farmRow.derived) && content?.summary) {
        usingFixture = false;
        derived = farmRow.derived as FarmDerived;
        diagnosis = content;
        simulatedToday = String(farmRow.simulated_today).slice(0, 10);
        baselineYear = farmRow.baseline_year as number;
        lastObsDate = simulatedToday;
        const remoteProfile = farmRow.profile as Partial<FarmProfile> | null;
        if (remoteProfile?.farmerName) {
          profile = {
            ...profile,
            ...remoteProfile,
            fictional: true,
            languages: config.profile.languages,
          };
        }
      }
    }
  } catch (error) {
    console.error("[farm-data] using fixture", error);
  }

  const cropNames: Partial<Record<Lang, string>> = {};
  for (const option of config.profile.languages) {
    cropNames[option] = cropFor(config, option);
  }
  profile = { ...profile, crop: cropNames[selected] || profile.crop };

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
      fixture: usingFixture,
    }),
    tools: toolsFor(config),
    profile,
    cropNames,
    derived,
    diagnosis,
    simulatedToday,
    baselineYear,
    lastObsDate,
    clipTopics: config.clipTopics,
    fixture: usingFixture ? FIXTURE_FLAG : null,
    eventName: config.profile.event.name,
  };
}
