/**
 * Sentinel-2 L2A NDVI via the Copernicus Data Space Statistical API.
 *   npx tsx scripts/fetch-ndvi.ts --farm cn-rice-2022
 */
import path from "node:path";
import type { GeoPolygon, NdviPoint } from "../src/lib/types";
import {
  addDays,
  farmDir,
  isRecord,
  loadEnv,
  readPolygon,
  round,
  selectedFarms,
  writeJson,
  type DateWindow,
} from "./pipeline";

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";
const MIN_VALID_PCT = 60;

const EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
  const bad = [3, 8, 9, 10].includes(s.SCL);
  return { ndvi: [ndvi], dataMask: [s.dataMask && !bad ? 1 : 0] };
}`;

type SeriesResult = { kept: NdviPoint[]; dropped: number };

async function main() {
  loadEnv();
  const farms = await selectedFarms();
  const clientId = process.env.CDSE_CLIENT_ID;
  const clientSecret = process.env.CDSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("CDSE_CLIENT_ID and CDSE_CLIENT_SECRET must be set in .env.local");
  }

  let token = await requestToken(clientId, clientSecret);
  for (const farm of farms) {
    const polygon = await readPolygon(farm);
    const event = await fetchSeries(token, () => requestToken(clientId, clientSecret), polygon, farm.analysisWindow);
    token = event.token;
    const baseline = await fetchSeries(token, () => requestToken(clientId, clientSecret), polygon, farm.baselineWindow);
    token = baseline.token;

    const outPath = path.join(farmDir(farm.id), "ndvi.json");
    await writeJson(outPath, { event: event.result.kept, baseline: baseline.result.kept });
    console.log(
      `${farm.id}: event kept ${event.result.kept.length} (dropped ${event.result.dropped}), baseline kept ${baseline.result.kept.length} (dropped ${baseline.result.dropped})`,
    );
  }
}

async function fetchSeries(
  token: string,
  refresh: () => Promise<string>,
  polygon: GeoPolygon,
  window: DateWindow,
): Promise<{ token: string; result: SeriesResult }> {
  const body = {
    input: {
      bounds: {
        geometry: polygon,
        properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
      },
      data: [{ type: "sentinel-2-l2a", dataFilter: { mosaickingOrder: "leastCC" } }],
    },
    aggregation: {
      timeRange: {
        from: `${window.start}T00:00:00Z`,
        to: `${addDays(window.end, 1)}T00:00:00Z`,
      },
      aggregationInterval: { of: "P5D", lastIntervalBehavior: "SHORTEN" },
      evalscript: EVALSCRIPT,
      resx: 0.0001,
      resy: 0.0001,
    },
  };

  let response = await postStats(token, body);
  if (response.status === 401) {
    token = await refresh();
    response = await postStats(token, body);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Statistical API ${response.status} for ${window.start}: ${detail.slice(0, 500)}`);
  }

  const payload = (await response.json()) as unknown;
  return { token, result: parseSeries(payload, window) };
}

async function postStats(token: string, body: unknown): Promise<Response> {
  return fetchRetry(STATS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function requestToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetchRetry(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`CDSE token request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("CDSE token response did not include access_token");
  return payload.access_token;
}

function parseSeries(payload: unknown, window: DateWindow): SeriesResult {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error(`Statistical API returned an unexpected body for ${window.start}`);
  }
  if (payload.status && payload.status !== "OK") {
    throw new Error(`Statistical API status ${String(payload.status)} for ${window.start}`);
  }

  const outside = outsidePixelCount(payload.data);
  const kept: NdviPoint[] = [];
  let dropped = 0;
  for (const item of payload.data) {
    const point = parseInterval(item, outside);
    if (!point) {
      dropped += 1;
      continue;
    }
    if (point.date < window.start || point.date > window.end) continue;
    if (point.validPixelPct < MIN_VALID_PCT) {
      dropped += 1;
      continue;
    }
    kept.push({
      date: point.date,
      mean: round(point.mean, 4),
      stdev: point.stdev === null ? null : round(point.stdev, 4),
      validPixelPct: round(point.validPixelPct, 1),
    });
  }
  kept.sort((a, b) => a.date.localeCompare(b.date));
  return { kept, dropped };
}

function parseInterval(item: unknown, outsidePixels: number): NdviPoint | null {
  if (!isRecord(item) || !isRecord(item.interval) || typeof item.interval.from !== "string") return null;
  const date = item.interval.from.slice(0, 10);
  const outputs = isRecord(item.outputs) ? item.outputs : null;
  const ndviOutput = outputs && isRecord(outputs.ndvi) ? outputs.ndvi : null;
  const stats = firstBandStats(ndviOutput);
  if (!stats) return null;

  const mean = finiteNumber(stats.mean);
  if (mean === null) return null;
  const sampleCount = finiteNumber(stats.sampleCount) ?? 0;
  const noDataCount = finiteNumber(stats.noDataCount) ?? 0;
  const validPixelPct = percentValid(sampleCount, noDataCount, outsidePixels);
  const stdev = finiteNumber(stats.stDev);

  return { date, mean, stdev, validPixelPct };
}

/** Clear views leave only the pixels outside the polygon in noDataCount. */
function outsidePixelCount(items: unknown[]): number {
  let outside = Infinity;
  for (const item of items) {
    if (!isRecord(item) || !isRecord(item.outputs) || !isRecord(item.outputs.ndvi)) continue;
    const stats = firstBandStats(item.outputs.ndvi);
    const noDataCount = stats ? finiteNumber(stats.noDataCount) : null;
    if (noDataCount !== null && noDataCount < outside) outside = noDataCount;
  }
  return Number.isFinite(outside) ? outside : 0;
}

function firstBandStats(output: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!output || !isRecord(output.bands)) return null;
  const first = Object.values(output.bands)[0];
  if (!isRecord(first) || !isRecord(first.stats)) return null;
  return first.stats;
}

/**
 * sampleCount is every pixel in the bounding box. noDataCount includes pixels
 * outside the polygon plus cloud, shadow, and cirrus. The smallest noDataCount
 * in the series is that outside-polygon floor.
 */
function percentValid(sampleCount: number, noDataCount: number, outsidePixels: number): number {
  const geometryPixels = sampleCount - outsidePixels;
  if (geometryPixels <= 0) return 0;
  const valid = Math.max(0, sampleCount - noDataCount);
  return (100 * valid) / geometryPixels;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchRetry(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
      if (response.status === 429 || response.status >= 500) {
        if (attempt === attempts) return response;
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`Request failed for ${new URL(url).host}: ${lastError instanceof Error ? lastError.message : lastError}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
