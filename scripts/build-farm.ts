/**
 * Combine NDVI and weather JSON into farm.json and print a summary table.
 *   npx tsx scripts/build-farm.ts --farm cn-rice-2022
 */
import path from "node:path";
import type { Farm, FarmDerived, NdviPoint, WeatherPoint } from "../src/lib/types";
import {
  addDays,
  centroid,
  diffDays,
  farmDir,
  isRecord,
  loadEnv,
  readJson,
  readPolygon,
  round,
  selectedFarms,
  shiftYear,
  writeJson,
  type PipelineFarm,
} from "./pipeline";

async function main() {
  loadEnv();
  const farms = await selectedFarms();
  for (const farm of farms) {
    const ndvi = await readNdvi(farm.id);
    const weather = await readWeather(farm.id);
    const polygon = await readPolygon(farm);
    const point = centroid(polygon);
    const simulatedToday = pickSimulatedToday(farm, ndvi.event);
    const derived = derive(farm, ndvi, weather, simulatedToday);
    const built: Farm = {
      profile: {
        id: farm.id,
        farmerName: farm.profile.farmerName,
        farmerNameEn: farm.profile.farmerNameEn,
        fictional: true,
        village: farm.profile.village ?? farm.profile.where ?? farm.profile.region,
        region: farm.profile.region,
        country: farm.profile.country,
        lat: round(point.lat, 5),
        lon: round(point.lon, 5),
        crop: farm.profile.crop,
        languages: farm.profile.languages,
        event: farm.profile.event,
      },
      polygon,
      simulatedToday,
      baselineYear: farm.baselineYear,
      ndvi,
      weather,
      derived,
      sources: [
        { name: "Sentinel-2 L2A", url: "https://dataspace.copernicus.eu/" },
        { name: "NASA POWER", url: "https://power.larc.nasa.gov/" },
      ],
    };
    if (farm.profile.fictional !== true) {
      throw new Error(`${farm.id}: profile.fictional must be true`);
    }
    await writeJson(path.join(farmDir(farm.id), "farm.json"), built);
    printSummary(farm, built, ndvi);
  }
}

function derive(
  farm: PipelineFarm,
  ndvi: { event: NdviPoint[]; baseline: NdviPoint[] },
  weather: WeatherPoint[],
  simulatedToday: string,
): FarmDerived {
  const now = ndvi.event.find((point) => point.date === simulatedToday);
  if (!now) throw new Error(`${farm.id}: no NDVI observation on ${simulatedToday}`);

  const agoTarget = addDays(simulatedToday, -30);
  const ago = closest(ndvi.event.filter((point) => point.date !== simulatedToday), agoTarget, `${farm.id} NDVI 30d earlier`);
  const baselineTarget = shiftYear(simulatedToday, farm.baselineYear);
  const baseline = closest(ndvi.baseline, baselineTarget, `${farm.id} baseline NDVI`);

  const rainStart = addDays(simulatedToday, -29);
  const rainStartBaseline = shiftYear(rainStart, farm.baselineYear);
  const wetnessNow = nearestWeather(weather, simulatedToday, (point) => point.rootZoneWetness);
  const wetnessBaseline = nearestWeather(weather, baselineTarget, (point) => point.rootZoneWetness);

  return {
    ndviNow: now.mean,
    ndvi30dAgo: ago.point.mean,
    ndviSameDateBaseline: baseline.point.mean,
    pctChange30d: percentChange(now.mean, ago.point.mean),
    pctChangeVsBaseline: percentChange(now.mean, baseline.point.mean),
    rain30dMm: sumPrecip(weather, rainStart, simulatedToday),
    rain30dMmBaseline: sumPrecip(weather, rainStartBaseline, baselineTarget),
    rainWindowMm: sumPrecip(weather, farm.analysisWindow.start, farm.analysisWindow.end),
    rainWindowMmBaseline: sumPrecip(weather, farm.baselineWindow.start, farm.baselineWindow.end),
    heatDays35C_30d: weather.filter(
      (point) =>
        point.date >= rainStart &&
        point.date <= simulatedToday &&
        point.tMaxC !== null &&
        point.tMaxC >= 35,
    ).length,
    rootZoneWetnessNow: wetnessNow.value,
    rootZoneWetnessBaseline: wetnessBaseline.value,
  };
}

function pickSimulatedToday(farm: PipelineFarm, event: NdviPoint[]): string {
  const { start, end } = farm.simulatedTodayWindow;
  const inWindow = event.filter((point) => point.date >= start && point.date <= end);
  if (inWindow.length === 0) {
    const nearby = event
      .filter((point) => point.date.slice(0, 7) === start.slice(0, 7) || point.date.slice(0, 7) === end.slice(0, 7))
      .map((point) => point.date);
    throw new Error(
      `${farm.id}: no cloud-free NDVI (valid pixels >= 60%) in ${start} .. ${end}. Nearby kept dates: ${nearby.join(", ") || "none"}`,
    );
  }
  return inWindow[inWindow.length - 1].date;
}

function printSummary(
  farm: PipelineFarm,
  built: Farm,
  ndvi: { event: NdviPoint[]; baseline: NdviPoint[] },
) {
  const derived = built.derived;
  const ago = closest(
    ndvi.event.filter((point) => point.date !== built.simulatedToday),
    addDays(built.simulatedToday, -30),
    "NDVI 30d earlier",
  );
  const baselineMatch = closest(
    ndvi.baseline,
    shiftYear(built.simulatedToday, farm.baselineYear),
    "baseline NDVI",
  );
  const baselineByDay = new Map(ndvi.baseline.map((point) => [point.date.slice(5), point]));
  const rows = ndvi.event.map((point) => {
    const baseline = baselineByDay.get(point.date.slice(5));
    const mark = point.date === built.simulatedToday ? "  <-- simulated today" : "";
    return [
      point.date.slice(5),
      point.mean.toFixed(3),
      `${point.validPixelPct.toFixed(0)}%`,
      baseline ? baseline.mean.toFixed(3) : "",
      baseline ? `${baseline.validPixelPct.toFixed(0)}%` : "",
      mark,
    ];
  });

  const header = ["MM-DD", `${farm.analysisWindow.start.slice(0, 4)} NDVI`, "valid", `${farm.baselineYear} NDVI`, "valid", ""];
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index])).join("  ");

  console.log("");
  console.log(`${built.profile.farmerName} (${built.profile.farmerNameEn})  ${farm.id}`);
  console.log(`${built.profile.crop} · ${built.profile.village}`);
  console.log(`Field centroid ${built.profile.lat}°N, ${built.profile.lon}°E`);
  console.log(`Simulated today ${built.simulatedToday} (${farm.simulatedTodayRule})`);
  console.log(`Baseline ${farm.baselineYear}, same calendar window`);
  console.log("");
  console.log(line(header));
  console.log(line(widths.map((width) => "-".repeat(width))));
  for (const row of rows) console.log(line(row));
  console.log("");
  console.log("Derived");
  console.log(`NDVI on ${built.simulatedToday}                  ${derived.ndviNow.toFixed(3)}`);
  console.log(`NDVI on ${ago.point.date} (${ago.daysOff}d from 30d earlier)  ${derived.ndvi30dAgo.toFixed(3)}   ${signed(derived.pctChange30d)}`);
  console.log(`NDVI on ${baselineMatch.point.date} (${baselineMatch.daysOff}d from ${shiftYear(built.simulatedToday, farm.baselineYear)})  ${derived.ndviSameDateBaseline.toFixed(3)}   ${signed(derived.pctChangeVsBaseline)}`);
  console.log(`Rain, 30 days ending that date (mm)       ${derived.rain30dMm} vs ${derived.rain30dMmBaseline} in ${farm.baselineYear}`);
  console.log(`Rain, full window (mm)                    ${derived.rainWindowMm} vs ${derived.rainWindowMmBaseline} in ${farm.baselineYear}`);
  console.log(`Days with max temp >= 35°C, those 30d     ${derived.heatDays35C_30d}`);
  console.log(`Root-zone wetness                         ${derived.rootZoneWetnessNow.toFixed(3)} vs ${derived.rootZoneWetnessBaseline.toFixed(3)} in ${farm.baselineYear}`);
  console.log("");
  const drop = derived.pctChangeVsBaseline < 0 ? "NDVI is below the baseline year." : "NDVI is not below the baseline year.";
  console.log(drop);
}

function closest(points: NdviPoint[], target: string, label: string): { point: NdviPoint; daysOff: number } {
  if (points.length === 0) throw new Error(`${label}: no observations`);
  let best = points[0];
  let bestAbs = Math.abs(diffDays(points[0].date, target));
  for (const point of points.slice(1)) {
    const distance = Math.abs(diffDays(point.date, target));
    if (distance < bestAbs) {
      best = point;
      bestAbs = distance;
    }
  }
  return { point: best, daysOff: bestAbs };
}

function nearestWeather(
  points: WeatherPoint[],
  target: string,
  pick: (point: WeatherPoint) => number | null,
): { date: string; value: number } {
  let best: { date: string; value: number; distance: number } | null = null;
  for (const point of points) {
    const value = pick(point);
    if (value === null) continue;
    const distance = Math.abs(diffDays(point.date, target));
    if (!best || distance < best.distance) best = { date: point.date, value, distance };
  }
  if (!best) throw new Error(`No weather value near ${target}`);
  return best;
}

function sumPrecip(points: WeatherPoint[], start: string, end: string): number {
  let sum = 0;
  let found = false;
  for (const point of points) {
    if (point.date < start || point.date > end || point.precipMm === null) continue;
    sum += point.precipMm;
    found = true;
  }
  if (!found) throw new Error(`No rainfall from ${start} to ${end}`);
  return round(sum, 1);
}

function percentChange(now: number, then: number): number {
  if (then === 0) throw new Error("Cannot compute a percent change from 0");
  return round((100 * (now - then)) / then, 1);
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

async function readNdvi(farmId: string): Promise<{ event: NdviPoint[]; baseline: NdviPoint[] }> {
  const filePath = path.join(farmDir(farmId), "ndvi.json");
  const json = await readJson(filePath).catch(() => {
    throw new Error(`Missing ${path.relative(process.cwd(), filePath)}. Run fetch-ndvi.ts first.`);
  });
  if (!isRecord(json) || !Array.isArray(json.event) || !Array.isArray(json.baseline)) {
    throw new Error(`${farmId}: ndvi.json must contain event and baseline arrays`);
  }
  return { event: json.event as NdviPoint[], baseline: json.baseline as NdviPoint[] };
}

async function readWeather(farmId: string): Promise<WeatherPoint[]> {
  const filePath = path.join(farmDir(farmId), "weather.json");
  const json = await readJson(filePath).catch(() => {
    throw new Error(`Missing ${path.relative(process.cwd(), filePath)}. Run fetch-weather.ts first.`);
  });
  if (!Array.isArray(json)) throw new Error(`${farmId}: weather.json must be an array`);
  return json as WeatherPoint[];
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
