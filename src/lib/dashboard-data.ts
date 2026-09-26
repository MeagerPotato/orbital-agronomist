import { createBrowserClient } from "./supabase";
import type { Diagnosis, FarmDerived, FarmProfile, GeoPolygon } from "./types";

export type DashboardFarm = {
  id: string;
  profile: FarmProfile;
  polygon: GeoPolygon;
  simulatedToday: string;
  baselineYear: number;
  derived: FarmDerived;
  sources: { name: string; url: string }[];
};

export type DashboardNdvi = {
  series: "event" | "baseline";
  date: string;
  mean: number;
};

export type DashboardWeather = {
  date: string;
  precipMm: number | null;
  tMaxC: number | null;
};

export type DashboardData = {
  farm: DashboardFarm;
  ndvi: DashboardNdvi[];
  weather: DashboardWeather[];
  diagnosis: Diagnosis | null;
};

export async function loadDashboard(farmId: string): Promise<DashboardData | null> {
  const supabase = createBrowserClient();
  const [farmResult, ndviResult, weatherResult, diagnosisResult] = await Promise.all([
    supabase
      .from("farms")
      .select("id, profile, polygon, simulated_today, baseline_year, derived, sources")
      .eq("id", farmId)
      .maybeSingle(),
    supabase
      .from("ndvi_observations")
      .select("series, date, mean")
      .eq("farm_id", farmId)
      .order("date"),
    supabase
      .from("weather_daily")
      .select("date, precip_mm, tmax_c")
      .eq("farm_id", farmId)
      .order("date"),
    supabase.from("diagnoses").select("content").eq("farm_id", farmId).maybeSingle(),
  ]);

  if (farmResult.error) throw new Error(farmResult.error.message);
  if (!farmResult.data) return null;
  if (ndviResult.error) throw new Error(ndviResult.error.message);
  if (weatherResult.error) throw new Error(weatherResult.error.message);
  if (diagnosisResult.error) throw new Error(diagnosisResult.error.message);

  const row = farmResult.data;
  return {
    farm: {
      id: row.id,
      profile: row.profile as FarmProfile,
      polygon: row.polygon as GeoPolygon,
      simulatedToday: String(row.simulated_today).slice(0, 10),
      baselineYear: row.baseline_year as number,
      derived: row.derived as FarmDerived,
      sources: (row.sources as { name: string; url: string }[]) ?? [],
    },
    ndvi: (ndviResult.data ?? []).map((point) => ({
      series: point.series as "event" | "baseline",
      date: String(point.date).slice(0, 10),
      mean: point.mean as number,
    })),
    weather: (weatherResult.data ?? []).map((point) => ({
      date: String(point.date).slice(0, 10),
      precipMm: point.precip_mm as number | null,
      tMaxC: point.tmax_c as number | null,
    })),
    diagnosis: (diagnosisResult.data?.content as Diagnosis | null) ?? null,
  };
}
