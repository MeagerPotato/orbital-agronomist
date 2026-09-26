/**
 * Regional NDVI change around cn-rice-2022.
 *   npx tsx scripts/fetch-drought-footprint.ts --farm cn-rice-2022
 *
 * About 40 cells of ~300 m, all within 5 km of the field. Each cell's greenness
 * on the Aug 25 2022 observation window versus the same window in 2021.
 */
import path from "node:path";
import type { GeoPolygon } from "../src/lib/types";
import {
  addDays,
  centroid,
  farmDir,
  isRecord,
  loadEnv,
  readPolygon,
  round,
  selectedFarms,
  writeJson,
} from "./pipeline";

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";
const CELL_METERS = 300;
const ROWS = 6;
const COLS = 7;

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

type Cell = {
  id: string;
  polygon: GeoPolygon;
  ndviEvent: number | null;
  ndviBaseline: number | null;
  pctChange: number | null;
};

async function main() {
  loadEnv();
  const clientId = process.env.CDSE_CLIENT_ID;
  const clientSecret = process.env.CDSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("CDSE_CLIENT_ID and CDSE_CLIENT_SECRET must be set in .env.local");
  }

  const farms = await selectedFarms();
  let token = await requestToken(clientId, clientSecret);
  const refresh = () => requestToken(clientId, clientSecret);

  for (const farm of farms) {
    if (farm.id !== "cn-rice-2022") {
      throw new Error(`${farm.id}: the drought footprint grid is defined for cn-rice-2022`);
    }
    const field = await readPolygon(farm);
    const center = centroid(field);
    const cells = buildGrid(center.lat, center.lon);
    const farthestKm = Math.max(...cells.map((cell) => distanceKm(center, cellCentroid(cell.polygon))));
    if (farthestKm > 5) throw new Error(`Grid extends ${farthestKm.toFixed(2)} km, past the 5 km limit`);

    console.log(`${farm.id}: ${cells.length} cells, farthest ${farthestKm.toFixed(2)} km`);
    await hydrate(farm.id, cells);
    const pending = cells.filter((cell) => cell.ndviEvent === null || cell.ndviBaseline === null);
    console.log(`${pending.length} cells still need a year`);
    let done = 0;
    await mapPool(pending, 2, async (cell) => {
      if (cell.ndviEvent === null) {
        const event = await cellNdvi(token, refresh, cell.polygon, "2022-08-25", "2022-08-29");
        token = event.token;
        cell.ndviEvent = event.mean;
      }
      if (cell.ndviBaseline === null) {
        const baseline = await cellNdvi(token, refresh, cell.polygon, "2021-08-25", "2021-09-03");
        token = baseline.token;
        cell.ndviBaseline = baseline.mean;
      }
      done += 1;
      if (done % 6 === 0 || done === pending.length) console.log(`  ${done}/${pending.length}`);
    });
    for (const cell of cells) {
      cell.pctChange =
        cell.ndviEvent !== null && cell.ndviBaseline !== null && cell.ndviBaseline !== 0
          ? round((100 * (cell.ndviEvent - cell.ndviBaseline)) / cell.ndviBaseline, 1)
          : null;
    }

    const withChange = cells.filter((cell) => cell.pctChange !== null).length;
    const outPath = path.join(farmDir(farm.id), "drought-footprint.json");
    await writeJson(outPath, {
      farmId: farm.id,
      cellMeters: CELL_METERS,
      eventWindow: { start: "2022-08-25", end: "2022-08-29" },
      baselineWindow: { start: "2021-08-25", end: "2021-09-03" },
      cells,
    });
    console.log(`${farm.id}: ${withChange}/${cells.length} cells have a percent change → ${outPath}`);
    if (withChange < 8) {
      throw new Error("Too few cells returned a clear August comparison");
    }
  }
}

async function hydrate(farmId: string, cells: Cell[]) {
  try {
    const saved = JSON.parse(
      await (await import("node:fs/promises")).readFile(
        path.join(farmDir(farmId), "drought-footprint.json"),
        "utf8",
      ),
    ) as { cells?: Cell[] };
    const prior = new Map((saved.cells ?? []).map((cell) => [cell.id, cell]));
    for (const cell of cells) {
      const old = prior.get(cell.id);
      if (!old) continue;
      if (typeof old.ndviEvent === "number") cell.ndviEvent = old.ndviEvent;
      if (typeof old.ndviBaseline === "number") cell.ndviBaseline = old.ndviBaseline;
    }
  } catch {
    // First run has no file yet.
  }
}

function buildGrid(lat: number, lon: number): Cell[] {
  const dLat = CELL_METERS / 110_540;
  const dLon = CELL_METERS / (111_320 * Math.cos((lat * Math.PI) / 180));
  const cells: Cell[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const south = lat + (row - (ROWS - 1) / 2) * dLat - dLat / 2;
      const west = lon + (col - (COLS - 1) / 2) * dLon - dLon / 2;
      const north = south + dLat;
      const east = west + dLon;
      cells.push({
        id: `r${row}c${col}`,
        polygon: {
          type: "Polygon",
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        },
        ndviEvent: null,
        ndviBaseline: null,
        pctChange: null,
      });
    }
  }
  return cells;
}

async function cellNdvi(
  token: string,
  refresh: () => Promise<string>,
  polygon: GeoPolygon,
  start: string,
  end: string,
): Promise<{ token: string; mean: number | null }> {
  await sleep(700);
  const body = {
    input: {
      bounds: {
        geometry: polygon,
        properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
      },
      data: [{ type: "sentinel-2-l2a", dataFilter: { mosaickingOrder: "leastCC" } }],
    },
    aggregation: {
      timeRange: { from: `${start}T00:00:00Z`, to: `${addDays(end, 1)}T00:00:00Z` },
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
    console.error(`Statistical API ${response.status} for ${start}: ${detail.slice(0, 180)}`);
    return { token, mean: null };
  }
  const payload = (await response.json()) as unknown;
  return { token, mean: meanNdvi(payload) };
}

function meanNdvi(payload: unknown): number | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;
  for (const item of payload.data) {
    if (!isRecord(item) || !isRecord(item.outputs) || !isRecord(item.outputs.ndvi)) continue;
    const bands = item.outputs.ndvi.bands;
    if (!isRecord(bands)) continue;
    const first = Object.values(bands)[0];
    if (!isRecord(first) || !isRecord(first.stats)) continue;
    const mean = first.stats.mean;
    if (typeof mean === "number" && Number.isFinite(mean)) return round(mean, 4);
  }
  return null;
}

function cellCentroid(polygon: GeoPolygon): { lat: number; lon: number } {
  const ring = polygon.coordinates[0].slice(0, -1);
  const lon = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
  const lat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  return { lat, lon };
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * 110.54;
  const dLon = (b.lon - a.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

async function postStats(token: string, body: unknown): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const response = await fetch(STATS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 6) return response;
        await sleep(1500 * 2 ** (attempt - 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 6) break;
      await sleep(1500 * 2 ** (attempt - 1));
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : "Statistical API request failed");
}

async function requestToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`CDSE token request failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("CDSE token response did not include access_token");
  return payload.access_token;
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
