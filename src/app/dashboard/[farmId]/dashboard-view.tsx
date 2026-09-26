"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { DashboardData } from "@/lib/dashboard-data";
import type { Diagnosis } from "@/lib/types";
import { NdviChart, WeatherChart } from "./charts";
import { LiveCallPanel } from "./live-call";
import { OrbitPanel } from "./orbit-panel";

const FieldMap = dynamic(() => import("./field-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-slate-800" />,
});

const STATUS_LABEL: Record<Diagnosis["status"], string> = {
  healthy: "Healthy",
  water_stress: "Water stress",
  heat_stress: "Heat stress",
  water_and_heat_stress: "Water and heat stress",
  unclear: "Unclear",
};

export function DashboardView({ farmId, data }: { farmId: string; data: DashboardData }) {
  const { farm, ndvi, weather, diagnosis } = data;
  const eventYear = Number(farm.simulatedToday.slice(0, 4));
  const [callUrl, setCallUrl] = useState(`/call/${farmId}`);

  useEffect(() => {
    setCallUrl(`${window.location.origin}/call/${farmId}`);
  }, [farmId]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.25em] text-amber-300 uppercase">Orbital Agronomist</p>
            <h1 className="text-3xl font-semibold text-white">{farm.profile.farmerName}</h1>
            <p className="text-lg text-slate-400">{farm.profile.farmerNameEn}</p>
            <p className="text-slate-200">
              {farm.profile.region} · {farm.profile.village}
            </p>
            <p className="max-w-xl text-sm text-slate-400">
              Replay of the August 2022 Yangtze drought, using real Sentinel-2 and NASA data. The farmer is fictional.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-3">
            <QRCodeSVG value={callUrl} size={112} bgColor="#0f172a" fgColor="#f8fafc" />
            <div className="max-w-40 text-sm text-slate-300">
              Scan to call this field from a phone.
            </div>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Greenness vs last year"
            value={formatSignedPercent(farm.derived.pctChangeVsBaseline)}
            detail="Same time last year"
          />
          <StatTile
            label="Rain, last 30 days"
            value={`${formatMm(farm.derived.rain30dMm)} vs ${formatMm(farm.derived.rain30dMmBaseline)}`}
            detail={`Versus ${farm.baselineYear}`}
          />
          <StatTile
            label="Heat days, last 30 days"
            value={String(farm.derived.heatDays35C_30d)}
            detail="Days at or above 35°C"
          />
          <StatTile
            label="Diagnosis"
            value={diagnosis ? STATUS_LABEL[diagnosis.status] : "Not ready"}
            detail={diagnosis ? `Severity ${diagnosis.severity}` : "No diagnosis stored"}
          />
        </div>

        <OrbitPanel farmId={farmId} polygon={farm.polygon} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Field">
            <div className="h-80 overflow-hidden rounded-xl">
              <FieldMap polygon={farm.polygon} />
            </div>
          </Panel>
          <Panel title={`Greenness, ${eventYear} vs ${farm.baselineYear}`}>
            <div className="h-80">
              <NdviChart
                points={ndvi}
                eventYear={eventYear}
                baselineYear={farm.baselineYear}
                simulatedToday={farm.simulatedToday}
              />
            </div>
          </Panel>
          <Panel title={`Rain and max temperature, ${eventYear} vs ${farm.baselineYear}`}>
            <div className="h-80">
              <WeatherChart points={weather} eventYear={eventYear} baselineYear={farm.baselineYear} />
            </div>
          </Panel>
          <DiagnosisCard diagnosis={diagnosis} />
        </div>

        <LiveCallPanel farmId={farmId} />

        <footer className="space-y-2 border-t border-slate-800 pt-4 text-sm text-slate-400">
          <p>
            Replay of real {farm.profile.event.name} satellite and weather data. Farmer is fictional.
            Guidance is general; confirm with your local agricultural extension officer.
          </p>
          <p>
            Sentinel-2 L2A (Copernicus). Contains modified Copernicus Sentinel data {farm.baselineYear}–{eventYear}. NASA POWER, NASA Langley Research Center. Grok Voice, Grok Imagine, Grok 4.7, Supabase.
          </p>
        </footer>
      </div>
    </main>
  );
}

function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3">
      <p className="text-xs tracking-wide text-slate-400 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      <p className="text-sm text-slate-400">{detail}</p>
    </section>
  );
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `−${Math.abs(rounded)}%`;
  return "0%";
}

function formatMm(value: number): string {
  const text = Number.isInteger(value) ? String(value) : String(value);
  return `${text} mm`;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
      <h2 className="mb-3 text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function DiagnosisCard({ diagnosis }: { diagnosis: Diagnosis | null }) {
  if (!diagnosis) {
    return (
      <Panel title="Diagnosis">
        <p className="text-slate-400">No diagnosis stored for this farm yet.</p>
      </Panel>
    );
  }
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Diagnosis</h2>
        <span className="rounded-full bg-amber-500/20 px-3 py-1 text-sm text-amber-200">
          {STATUS_LABEL[diagnosis.status]} · severity {diagnosis.severity}
        </span>
      </div>
      <p className="text-base text-slate-100">{diagnosis.summary.en}</p>
      <p className="mt-2 text-base text-slate-300">{diagnosis.summary.zh}</p>
      <ul className="mt-4 space-y-2 text-sm text-slate-300">
        {diagnosis.evidence.map((item, index) => (
          <li key={index} className="border-l-2 border-amber-400 pl-3">
            {item.en}
          </li>
        ))}
      </ul>
      <ol className="mt-4 space-y-2 text-sm text-slate-200">
        {diagnosis.actions.map((action, index) => (
          <li key={action.topic}>
            <span className="text-amber-300">{index + 1}. {action.topic.replaceAll("_", " ")}</span>
            <span className="mt-1 block text-slate-300">{action.text.en}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
