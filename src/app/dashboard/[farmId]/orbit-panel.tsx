"use client";

import { useState } from "react";
import type { GeoPolygon } from "@/lib/types";

const BEFORE = "2022-07-06";
const AFTER = "2022-08-25";

export function OrbitPanel({ farmId, polygon }: { farmId: string; polygon: GeoPolygon }) {
  const [mode, setMode] = useState<"truecolor" | "ndvi">("truecolor");
  const [reveal, setReveal] = useState(55);
  if (farmId !== "cn-rice-2022") return null;

  const before = imageryUrl(farmId, mode, BEFORE);
  const after = imageryUrl(farmId, mode, AFTER);
  const outline = outlinePoints(polygon);

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">From orbit</h2>
        <div className="flex rounded-full border border-slate-600 p-1 text-sm">
          <ModeButton active={mode === "truecolor"} onClick={() => setMode("truecolor")}>
            True color
          </ModeButton>
          <ModeButton active={mode === "ndvi"} onClick={() => setMode("ndvi")}>
            NDVI
          </ModeButton>
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-lg overflow-hidden rounded-xl bg-slate-950">
        <img src={after} alt={`August 25, 2022 ${mode === "ndvi" ? "NDVI" : "true color"}`} className="block w-full" />
        <img
          src={before}
          alt=""
          className="absolute inset-0 h-full w-full"
          style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}
        />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon points={outline} fill="none" stroke="#fbbf24" strokeWidth="0.8" />
        </svg>
        <div className="pointer-events-none absolute inset-y-0 w-px bg-white" style={{ left: `${reveal}%` }} />
        <input
          type="range"
          min={0}
          max={100}
          value={reveal}
          aria-label="Compare July 6 and August 25"
          onChange={(event) => setReveal(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <div className="mt-2 flex justify-between text-sm text-slate-300">
        <span>July 6, 2022</span>
        <span>August 25, 2022</span>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        {mode === "ndvi"
          ? "NDVI is colored red (low greenness) to yellow to green (high greenness). "
          : ""}
        Sentinel-2 L2A, 10 m resolution, contains modified Copernicus Sentinel data 2022.
      </p>
    </section>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-amber-400 px-3 py-1 font-semibold text-slate-950"
          : "rounded-full px-3 py-1 text-slate-300"
      }
    >
      {children}
    </button>
  );
}

function imageryUrl(farmId: string, kind: "truecolor" | "ndvi", date: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/clips/${farmId}/imagery/${kind}-${date}.png`;
}

/** Same 30% expansion as scripts/fetch-imagery.ts, mapped into a 0–100 image box. */
function outlinePoints(polygon: GeoPolygon): string {
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
  const west = minLon - padLon;
  const south = minLat - padLat;
  const east = maxLon + padLon;
  const north = maxLat + padLat;
  return ring
    .map(([lon, lat]) => {
      const x = ((lon - west) / (east - west)) * 100;
      const y = ((north - lat) / (north - south)) * 100;
      return `${x},${y}`;
    })
    .join(" ");
}
