import dotenv from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GeoPolygon, Lang } from "../src/lib/types";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
}

export type DateWindow = { start: string; end: string };

export type PipelineFarm = {
  id: string;
  polygonPath: string;
  analysisWindow: DateWindow;
  baselineYear: number;
  baselineWindow: DateWindow;
  simulatedTodayRule: string;
  simulatedTodayWindow: DateWindow;
  profile: {
    farmerName: string;
    farmerNameEn: string;
    fictional: boolean;
    where?: string;
    village?: string;
    region: string;
    country: string;
    crop: string;
    languages: Lang[];
    event: { name: string; summary: string };
  };
};

export function farmDir(farmId: string): string {
  return path.join(repoRoot, "data", "farms", farmId);
}

export async function selectedFarms(argv = process.argv.slice(2)): Promise<PipelineFarm[]> {
  const farms = await readFarms();
  if (argv.length === 0) return farms;
  if (argv.length !== 2 || argv[0] !== "--farm" || !argv[1] || argv[1].startsWith("--")) {
    throw new Error("Usage: npx tsx scripts/<name>.ts [--farm <id>]");
  }
  const farm = farms.find((item) => item.id === argv[1]);
  if (!farm) {
    throw new Error(`Unknown farm "${argv[1]}". Known farms: ${farms.map((item) => item.id).join(", ")}`);
  }
  return [farm];
}

export async function readPolygon(farm: PipelineFarm): Promise<GeoPolygon> {
  const filePath = path.resolve(repoRoot, farm.polygonPath);
  const json = await readJson(filePath);
  const polygon = findPolygon(json);
  if (!polygon) {
    throw new Error(`${farm.polygonPath} must contain one GeoJSON Polygon`);
  }
  return polygon;
}

export function centroid(polygon: GeoPolygon): { lat: number; lon: number } {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 4) throw new Error("Polygon ring needs at least 4 positions");

  let twiceArea = 0;
  let lonSum = 0;
  let latSum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    lonSum += (x1 + x2) * cross;
    latSum += (y1 + y2) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    const unique = ring.slice(0, -1);
    const lon = unique.reduce((sum, point) => sum + point[0], 0) / unique.length;
    const lat = unique.reduce((sum, point) => sum + point[1], 0) / unique.length;
    return { lat, lon };
  }

  return { lon: lonSum / (3 * twiceArea), lat: latSum / (3 * twiceArea) };
}

export async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Invalid JSON: ${path.relative(repoRoot, filePath)}`);
  }
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function shiftYear(isoDate: string, year: number): string {
  return `${year}-${isoDate.slice(5, 10)}`;
}

export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd);
  return Math.round(ms / 86_400_000);
}

export function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readFarms(): Promise<PipelineFarm[]> {
  const config = await readJson(path.join(repoRoot, "data", "farms.config.json"));
  if (!isRecord(config) || !Array.isArray(config.farms)) {
    throw new Error("data/farms.config.json must contain a farms array");
  }
  return config.farms.map((farm, index) => {
    if (!isPipelineFarm(farm)) {
      throw new Error(`data/farms.config.json farms[${index}] is missing pipeline fields`);
    }
    return farm;
  });
}

function isPipelineFarm(value: unknown): value is PipelineFarm {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.profile)) return false;
  return (
    typeof value.polygonPath === "string" &&
    isWindow(value.analysisWindow) &&
    isWindow(value.baselineWindow) &&
    isWindow(value.simulatedTodayWindow) &&
    typeof value.baselineYear === "number" &&
    typeof value.simulatedTodayRule === "string"
  );
}

function isWindow(value: unknown): value is DateWindow {
  return isRecord(value) && typeof value.start === "string" && typeof value.end === "string";
}

function findPolygon(value: unknown): GeoPolygon | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "Polygon" && Array.isArray(value.coordinates)) return value as GeoPolygon;
  if (value.type === "Feature") return findPolygon(value.geometry);
  if (value.type === "FeatureCollection" && Array.isArray(value.features)) {
    if (value.features.length !== 1) {
      throw new Error(`Expected one field polygon, found ${value.features.length}`);
    }
    return findPolygon(value.features[0]);
  }
  return null;
}
