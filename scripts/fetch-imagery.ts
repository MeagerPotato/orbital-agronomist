/**
 * Sentinel-2 L2A true-color and NDVI PNGs for cn-rice-2022.
 *   npx tsx scripts/fetch-imagery.ts --farm cn-rice-2022
 *
 * Four images, bbox 30% larger than the field, about 10 m per pixel:
 * true color and NDVI on the clearest early-July observation and on 2022-08-25.
 * Uploads to Storage clips/{farmId}/imagery/.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServerClient } from "../src/lib/supabase";
import type { GeoPolygon } from "../src/lib/types";
import { addDays, farmDir, isRecord, loadEnv, readPolygon, selectedFarms } from "./pipeline";

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";
const AFTER_DATE = "2022-08-25";
const METERS_PER_PIXEL = 10;

const TRUE_COLOR = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "dataMask"] }],
    output: { bands: 4 }
  };
}
function evaluatePixel(s) {
  return [2.5 * s.B04, 2.5 * s.B03, 2.5 * s.B02, s.dataMask];
}`;

const NDVI_COLOR = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "dataMask"] }],
    output: { bands: 4 }
  };
}
function evaluatePixel(s) {
  var ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
  var t = Math.max(0, Math.min(1, ndvi / 0.8));
  var r, g, b;
  if (t < 0.5) {
    var u = t / 0.5;
    r = 0.8;
    g = 0.12 + 0.73 * u;
    b = 0.08;
  } else {
    var u = (t - 0.5) / 0.5;
    r = 0.8 * (1 - u);
    g = 0.85 - 0.25 * u;
    b = 0.08 + 0.12 * u;
  }
  return [r, g, b, s.dataMask];
}`;

async function main() {
  loadEnv();
  const clientId = process.env.CDSE_CLIENT_ID;
  const clientSecret = process.env.CDSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("CDSE_CLIENT_ID and CDSE_CLIENT_SECRET must be set in .env.local");
  }

  const farms = await selectedFarms();
  let token = await requestToken(clientId, clientSecret);
  const supabase = createServerClient();

  for (const farm of farms) {
    if (farm.id !== "cn-rice-2022") {
      throw new Error(`${farm.id}: imagery dates are defined for cn-rice-2022`);
    }
    const polygon = await readPolygon(farm);
    const july = await clearestEarlyJuly(farm.id);
    const dates = [july, AFTER_DATE];
    const bbox = expandedBbox(polygon);
    const { width, height } = pixelSize(bbox);
    console.log(
      `${farm.id}: July ${july}, August ${AFTER_DATE}, bbox ${bbox.map((n) => n.toFixed(5)).join(", ")}, ${width}x${height} px`,
    );

    for (const date of dates) {
      for (const kind of ["truecolor", "ndvi"] as const) {
        const png = await render(token, () => requestToken(clientId, clientSecret), {
          bbox,
          width,
          height,
          date,
          evalscript: kind === "truecolor" ? TRUE_COLOR : NDVI_COLOR,
        });
        token = png.token;
        const objectPath = `${farm.id}/imagery/${kind}-${date}.png`;
        const { error } = await supabase.storage.from("clips").upload(objectPath, png.bytes, {
          contentType: "image/png",
          upsert: true,
        });
        if (error) throw new Error(`storage upload clips/${objectPath}: ${error.message}`);
        console.log(`uploaded clips/${objectPath} (${png.bytes.byteLength} bytes)`);
      }
    }
  }
}

/** Highest clear-pixel share from July 1–15. Ties keep the earlier date. */
async function clearestEarlyJuly(farmId: string): Promise<string> {
  const json = JSON.parse(await readFile(path.join(farmDir(farmId), "ndvi.json"), "utf8")) as unknown;
  if (!isRecord(json) || !Array.isArray(json.event)) {
    throw new Error(`${farmId}: ndvi.json is missing the event series`);
  }
  const early = json.event.filter((point) => {
    if (!isRecord(point) || typeof point.date !== "string") return false;
    return point.date >= "2022-07-01" && point.date <= "2022-07-15";
  });
  if (early.length === 0) throw new Error(`${farmId}: no early-July NDVI observation`);
  early.sort((a, b) => {
    const left = isRecord(a) && typeof a.validPixelPct === "number" ? a.validPixelPct : 0;
    const right = isRecord(b) && typeof b.validPixelPct === "number" ? b.validPixelPct : 0;
    if (right !== left) return right - left;
    return String(isRecord(a) ? a.date : "").localeCompare(String(isRecord(b) ? b.date : ""));
  });
  const winner = early[0];
  if (!isRecord(winner) || typeof winner.date !== "string") {
    throw new Error(`${farmId}: early-July observation has no date`);
  }
  return winner.date;
}

/** 30% larger than the field, same center. [minLon, minLat, maxLon, maxLat]. */
function expandedBbox(polygon: GeoPolygon): [number, number, number, number] {
  const ring = polygon.coordinates[0] ?? [];
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  const padLon = (maxLon - minLon) * 0.15;
  const padLat = (maxLat - minLat) * 0.15;
  return [minLon - padLon, minLat - padLat, maxLon + padLon, maxLat + padLat];
}

function pixelSize(bbox: [number, number, number, number]): { width: number; height: number } {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const metersX = (maxLon - minLon) * 111_320 * Math.cos(midLat);
  const metersY = (maxLat - minLat) * 110_540;
  return {
    width: Math.max(1, Math.round(metersX / METERS_PER_PIXEL)),
    height: Math.max(1, Math.round(metersY / METERS_PER_PIXEL)),
  };
}

async function render(
  token: string,
  refresh: () => Promise<string>,
  scene: {
    bbox: [number, number, number, number];
    width: number;
    height: number;
    date: string;
    evalscript: string;
  },
): Promise<{ token: string; bytes: Buffer }> {
  const body = {
    input: {
      bounds: {
        bbox: scene.bbox,
        properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
      },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: {
              from: `${scene.date}T00:00:00Z`,
              to: `${addDays(scene.date, 5)}T00:00:00Z`,
            },
            mosaickingOrder: "leastCC",
          },
        },
      ],
    },
    output: {
      width: scene.width,
      height: scene.height,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: scene.evalscript,
  };

  let response = await postProcess(token, body);
  if (response.status === 401) {
    token = await refresh();
    response = await postProcess(token, body);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || bytes[0] !== 0x89) {
    throw new Error(`Process API ${response.status} for ${scene.date}: ${bytes.toString("utf8").slice(0, 400)}`);
  }
  return { token, bytes };
}

async function postProcess(token: string, body: unknown): Promise<Response> {
  return fetch(PROCESS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
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
    throw new Error(`CDSE token request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("CDSE token response did not include access_token");
  return payload.access_token;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
