/**
 * NASA POWER daily weather at the field centroid. No API key.
 *   npx tsx scripts/fetch-weather.ts --farm cn-rice-2022
 */
import path from "node:path";
import type { WeatherPoint } from "../src/lib/types";
import {
  centroid,
  farmDir,
  isRecord,
  loadEnv,
  readPolygon,
  round,
  selectedFarms,
  writeJson,
  type DateWindow,
} from "./pipeline";

const POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";

async function main() {
  loadEnv();
  const farms = await selectedFarms();
  for (const farm of farms) {
    const polygon = await readPolygon(farm);
    const point = centroid(polygon);
    const event = await fetchWindow(point, farm.analysisWindow);
    const baseline = await fetchWindow(point, farm.baselineWindow);
    const weather = [...baseline, ...event].sort((a, b) => a.date.localeCompare(b.date));
    await writeJson(path.join(farmDir(farm.id), "weather.json"), weather);
    console.log(
      `${farm.id}: ${weather.length} weather days at ${point.lat.toFixed(4)}°N, ${point.lon.toFixed(4)}°E`,
    );
  }
}

async function fetchWindow(
  point: { lat: number; lon: number },
  window: DateWindow,
): Promise<WeatherPoint[]> {
  const url = new URL(POWER_URL);
  url.searchParams.set("parameters", "PRECTOTCORR,T2M_MAX,T2M,GWETROOT");
  url.searchParams.set("community", "AG");
  url.searchParams.set("longitude", point.lon.toFixed(4));
  url.searchParams.set("latitude", point.lat.toFixed(4));
  url.searchParams.set("start", window.start.replaceAll("-", ""));
  url.searchParams.set("end", window.end.replaceAll("-", ""));
  url.searchParams.set("format", "JSON");

  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`NASA POWER ${response.status} for ${window.start}: ${detail.slice(0, 300)}`);
  }
  const payload = (await response.json()) as unknown;
  return parsePower(payload, window);
}

function parsePower(payload: unknown, window: DateWindow): WeatherPoint[] {
  if (!isRecord(payload) || !isRecord(payload.properties) || !isRecord(payload.properties.parameter)) {
    throw new Error(`NASA POWER returned an unexpected body for ${window.start}`);
  }
  const parameter = payload.properties.parameter;
  const precip = series(parameter.PRECTOTCORR, "PRECTOTCORR");
  const tmax = series(parameter.T2M_MAX, "T2M_MAX");
  const tmean = series(parameter.T2M, "T2M");
  const wetness = series(parameter.GWETROOT, "GWETROOT");
  const dates = [...precip.keys()].sort();

  return dates.map((stamp) => {
    const date = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
    return {
      date,
      precipMm: roundOrNull(precip.get(stamp) ?? null, 2),
      tMaxC: roundOrNull(tmax.get(stamp) ?? null, 2),
      tMeanC: roundOrNull(tmean.get(stamp) ?? null, 2),
      rootZoneWetness: roundOrNull(wetness.get(stamp) ?? null, 3),
    };
  });
}

function series(value: unknown, name: string): Map<string, number | null> {
  if (!isRecord(value)) throw new Error(`NASA POWER response is missing ${name}`);
  const out = new Map<string, number | null>();
  for (const [key, raw] of Object.entries(value)) {
    if (!/^\d{8}$/.test(key)) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= -999) {
      out.set(key, null);
      continue;
    }
    out.set(key, raw);
  }
  return out;
}

function roundOrNull(value: number | null, digits: number): number | null {
  return value === null ? null : round(value, digits);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
