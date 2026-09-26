/**
 * Upsert farms, NDVI, weather, and diagnoses from JSON.
 * Run after Phase 1, once data/farms/{id}/farm.json exists:
 *   npx tsx scripts/seed-supabase.ts
 *   npx tsx scripts/seed-supabase.ts --farm cn-rice-2022
 * diagnosis.json is optional until Phase 3. Safe to rerun.
 */
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "../src/lib/supabase-server";
import type {
  Diagnosis,
  Farm,
  NdviPoint,
  WeatherPoint,
} from "../src/lib/types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });

type NdviRow = {
  farm_id: string;
  series: "event" | "baseline";
  date: string;
  mean: number;
  stdev: number | null;
  valid_pct: number;
};

type WeatherRow = {
  farm_id: string;
  date: string;
  precip_mm: number | null;
  tmax_c: number | null;
  tmean_c: number | null;
  root_zone_wetness: number | null;
};

type PreparedFarm = {
  id: string;
  farm: Farm;
  diagnosis: { content: Diagnosis; model: string } | null;
};

async function main() {
  const ids = selectFarmIds(await readFarmIds());
  const prepared = await Promise.all(ids.map(loadFarm));
  const supabase = createServerClient();

  for (const item of prepared) {
    await seedFarm(supabase, item);
  }
}

function selectFarmIds(ids: string[]): string[] {
  const args = process.argv.slice(2);
  if (args.length === 0) return ids;

  if (args.length !== 2 || args[0] !== "--farm" || !args[1] || args[1].startsWith("--")) {
    throw new Error("Usage: npx tsx scripts/seed-supabase.ts [--farm <id>]");
  }

  const id = args[1];
  if (!ids.includes(id)) {
    throw new Error(`Unknown farm "${id}". Known farms: ${ids.join(", ")}`);
  }
  return [id];
}

async function readFarmIds(): Promise<string[]> {
  const configPath = path.join(repoRoot, "data", "farms.config.json");
  const config = await readJson(configPath);
  if (!isRecord(config) || !Array.isArray(config.farms)) {
    throw new Error("data/farms.config.json must contain a farms array");
  }

  const ids = config.farms.map((farm, index) => {
    if (!isRecord(farm) || typeof farm.id !== "string" || farm.id.length === 0) {
      throw new Error(`data/farms.config.json farms[${index}] is missing id`);
    }
    return farm.id;
  });

  if (ids.length === 0) throw new Error("data/farms.config.json has no farms");
  return ids;
}

async function loadFarm(farmId: string): Promise<PreparedFarm> {
  const farmPath = path.join(repoRoot, "data", "farms", farmId, "farm.json");
  let farmJson: unknown;
  try {
    farmJson = await readJson(farmPath);
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error(
        `Missing ${path.relative(repoRoot, farmPath)}. Run Phase 1 (build-farm) before seeding.`,
      );
    }
    throw error;
  }

  const diagnosisPath = path.join(repoRoot, "data", "farms", farmId, "diagnosis.json");
  const diagnosisJson = await readOptionalJson(diagnosisPath);

  return {
    id: farmId,
    farm: parseFarm(farmId, farmJson),
    diagnosis: diagnosisJson === undefined ? null : parseDiagnosis(farmId, diagnosisJson),
  };
}

async function seedFarm(supabase: SupabaseClient, item: PreparedFarm) {
  const { id, farm, diagnosis } = item;

  const farmResult = await supabase.from("farms").upsert(
    {
      id,
      profile: farm.profile,
      polygon: farm.polygon,
      simulated_today: asDate(farm.simulatedToday, `${id} simulatedToday`),
      baseline_year: farm.baselineYear,
      derived: farm.derived,
      sources: farm.sources,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (farmResult.error) throw new Error(`${id} farms: ${farmResult.error.message}`);

  const ndviRows = ndviToRows(id, farm);
  const weatherRows = weatherToRows(id, farm);
  await clearFarmRows(supabase, "ndvi_observations", id);
  await clearFarmRows(supabase, "weather_daily", id);
  if (ndviRows.length > 0) {
    const ndviResult = await supabase.from("ndvi_observations").insert(ndviRows);
    if (ndviResult.error) throw new Error(`${id} ndvi_observations: ${ndviResult.error.message}`);
  }
  if (weatherRows.length > 0) {
    const weatherResult = await supabase.from("weather_daily").insert(weatherRows);
    if (weatherResult.error) throw new Error(`${id} weather_daily: ${weatherResult.error.message}`);
  }

  if (diagnosis) {
    const diagnosisResult = await supabase.from("diagnoses").upsert(
      {
        farm_id: id,
        content: diagnosis.content,
        model: diagnosis.model,
      },
      { onConflict: "farm_id" },
    );
    if (diagnosisResult.error) {
      throw new Error(`${id} diagnoses: ${diagnosisResult.error.message}`);
    }
  }

  const diagnosisLabel = diagnosis ? diagnosis.model : "skipped (no diagnosis.json yet)";
  console.log(
    `${id}: ndvi event ${farm.ndvi.event.length}, baseline ${farm.ndvi.baseline.length}, weather ${farm.weather.length}, diagnosis ${diagnosisLabel}`,
  );
}

function ndviToRows(farmId: string, farm: Farm): NdviRow[] {
  return [
    ...seriesRows(farmId, "event", farm.ndvi.event),
    ...seriesRows(farmId, "baseline", farm.ndvi.baseline),
  ];
}

function seriesRows(
  farmId: string,
  series: "event" | "baseline",
  points: NdviPoint[],
): NdviRow[] {
  const rows = points.map((point, index) => ({
    farm_id: farmId,
    series,
    date: asDate(point.date, `${farmId} ndvi.${series}[${index}].date`),
    mean: point.mean,
    stdev: point.stdev,
    valid_pct: point.validPixelPct,
  }));
  assertUniqueDates(farmId, `ndvi ${series}`, rows.map((row) => row.date));
  return rows;
}

function weatherToRows(farmId: string, farm: Farm): WeatherRow[] {
  const rows = farm.weather.map((point, index) => ({
    farm_id: farmId,
    date: asDate(point.date, `${farmId} weather[${index}].date`),
    precip_mm: point.precipMm,
    tmax_c: point.tMaxC,
    tmean_c: point.tMeanC,
    root_zone_wetness: point.rootZoneWetness,
  }));
  assertUniqueDates(farmId, "weather", rows.map((row) => row.date));
  return rows;
}

async function clearFarmRows(
  supabase: SupabaseClient,
  table: "ndvi_observations" | "weather_daily",
  farmId: string,
) {
  const deleted = await supabase.from(table).delete().eq("farm_id", farmId);
  if (deleted.error) throw new Error(`${farmId} ${table} delete: ${deleted.error.message}`);
}

function parseFarm(farmId: string, value: unknown): Farm {
  if (!isRecord(value)) throw new Error(`${farmId}: farm.json must be an object`);

  const profile = value.profile;
  if (!isRecord(profile) || profile.id !== farmId) {
    throw new Error(`${farmId}: farm.json profile.id must be ${farmId}`);
  }
  if (profile.fictional !== true) {
    throw new Error(`${farmId}: farm.json profile.fictional must be true`);
  }

  const polygon = value.polygon;
  if (!isRecord(polygon) || polygon.type !== "Polygon" || !Array.isArray(polygon.coordinates)) {
    throw new Error(`${farmId}: farm.json polygon must be a GeoJSON Polygon`);
  }

  if (typeof value.simulatedToday !== "string") {
    throw new Error(`${farmId}: farm.json simulatedToday must be a date string`);
  }
  if (!Number.isInteger(value.baselineYear)) {
    throw new Error(`${farmId}: farm.json baselineYear must be an integer`);
  }
  if (!isRecord(value.derived)) throw new Error(`${farmId}: farm.json derived must be an object`);
  if (!Array.isArray(value.sources)) throw new Error(`${farmId}: farm.json sources must be an array`);

  const ndvi = value.ndvi;
  if (!isRecord(ndvi)) throw new Error(`${farmId}: farm.json ndvi must be an object`);

  return {
    profile: profile as Farm["profile"],
    polygon: polygon as Farm["polygon"],
    simulatedToday: value.simulatedToday,
    baselineYear: value.baselineYear as number,
    ndvi: {
      event: parseNdviSeries(farmId, "event", ndvi.event),
      baseline: parseNdviSeries(farmId, "baseline", ndvi.baseline),
    },
    weather: parseWeather(farmId, value.weather),
    derived: value.derived as Farm["derived"],
    sources: value.sources as Farm["sources"],
  };
}

function parseNdviSeries(farmId: string, series: "event" | "baseline", value: unknown): NdviPoint[] {
  if (!Array.isArray(value)) {
    throw new Error(`${farmId}: farm.json ndvi.${series} must be an array`);
  }
  return value.map((point, index) => {
    const label = `${farmId} ndvi.${series}[${index}]`;
    if (!isRecord(point)) throw new Error(`${label} must be an object`);
    return {
      date: requireString(point.date, `${label}.date`),
      mean: requireNumber(point.mean, `${label}.mean`),
      stdev: requireNullableNumber(point.stdev, `${label}.stdev`),
      validPixelPct: requireNumber(point.validPixelPct, `${label}.validPixelPct`),
    };
  });
}

function parseWeather(farmId: string, value: unknown): WeatherPoint[] {
  if (!Array.isArray(value)) throw new Error(`${farmId}: farm.json weather must be an array`);
  return value.map((point, index) => {
    const label = `${farmId} weather[${index}]`;
    if (!isRecord(point)) throw new Error(`${label} must be an object`);
    return {
      date: requireString(point.date, `${label}.date`),
      precipMm: requireNullableNumber(point.precipMm, `${label}.precipMm`),
      tMaxC: requireNullableNumber(point.tMaxC, `${label}.tMaxC`),
      tMeanC: requireNullableNumber(point.tMeanC, `${label}.tMeanC`),
      rootZoneWetness: requireNullableNumber(point.rootZoneWetness, `${label}.rootZoneWetness`),
    };
  });
}

function parseDiagnosis(farmId: string, value: unknown): { content: Diagnosis; model: string } {
  if (!isRecord(value)) throw new Error(`${farmId}: diagnosis.json must be an object`);
  const model = typeof value.model === "string" && value.model.length > 0 ? value.model : "grok-4.7";
  const content = { ...value };
  delete content.model;
  return { content: content as Diagnosis, model };
}

function assertUniqueDates(farmId: string, label: string, dates: string[]) {
  const seen = new Set<string>();
  for (const date of dates) {
    if (seen.has(date)) throw new Error(`${farmId}: duplicate ${label} date ${date}`);
    seen.add(date);
  }
}

function asDate(value: string, label: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value);
  if (!match) throw new Error(`${label}: expected YYYY-MM-DD, got ${value}`);
  return match[1];
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function requireNullableNumber(value: unknown, label: string): number | null {
  if (value === null) return null;
  return requireNumber(value, label);
}

async function readJson(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Invalid JSON: ${path.relative(repoRoot, filePath)}`);
  }
}

async function readOptionalJson(filePath: string): Promise<unknown | undefined> {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (isEnoent(error)) return undefined;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
