"use client";

import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardNdvi, DashboardWeather } from "@/lib/dashboard-data";

const axis = { stroke: "#94a3b8", fontSize: 12 };
const grid = { stroke: "#1e293b" };

export function NdviChart({
  points,
  eventYear,
  baselineYear,
  simulatedToday,
}: {
  points: DashboardNdvi[];
  eventYear: number;
  baselineYear: number;
  simulatedToday: string;
}) {
  const rows = new Map<number, { doy: number; event?: number; baseline?: number }>();
  for (const point of points) {
    const doy = dayOfYear(point.date);
    const row = rows.get(doy) ?? { doy };
    if (point.series === "event") row.event = point.mean;
    else row.baseline = point.mean;
    rows.set(doy, row);
  }
  const data = [...rows.values()].sort((a, b) => a.doy - b.doy);
  const today = dayOfYear(simulatedToday);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 28, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={grid.stroke} />
        <XAxis dataKey="doy" tick={axis} tickFormatter={doyLabel} />
        <YAxis
          tick={axis}
          domain={[0, 1]}
          width={48}
          label={{
            value: "Greenness (NDVI)",
            angle: -90,
            position: "insideLeft",
            fill: "#94a3b8",
            fontSize: 12,
            dx: -4,
          }}
        />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
          labelFormatter={(value) => doyLabel(Number(value))}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="event"
          name={`${eventYear} greenness`}
          stroke="#f59e0b"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#f59e0b" }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="baseline"
          name={`${baselineYear} greenness`}
          stroke="#38bdf8"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#38bdf8" }}
          connectNulls
        />
        <ReferenceLine
          x={today}
          stroke="#f8fafc"
          strokeDasharray="4 4"
          label={{ value: "Today", position: "top", fill: "#f8fafc", fontSize: 12 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WeatherChart({
  points,
  eventYear,
  baselineYear,
}: {
  points: DashboardWeather[];
  eventYear: number;
  baselineYear: number;
}) {
  const rows = new Map<
    number,
    { doy: number; rainEvent?: number; rainBaseline?: number; tempEvent?: number; tempBaseline?: number }
  >();
  let rainEvent = 0;
  let rainBaseline = 0;
  const tempEvent = rollingMaxTemp(points, eventYear);
  const tempBaseline = rollingMaxTemp(points, baselineYear);
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  for (const point of ordered) {
    const year = Number(point.date.slice(0, 4));
    const doy = dayOfYear(point.date);
    const row = rows.get(doy) ?? { doy };
    if (year === eventYear) {
      if (point.precipMm !== null) rainEvent += point.precipMm;
      row.rainEvent = Math.round(rainEvent * 10) / 10;
      const temp = tempEvent.get(doy);
      if (temp !== undefined) row.tempEvent = temp;
    } else if (year === baselineYear) {
      if (point.precipMm !== null) rainBaseline += point.precipMm;
      row.rainBaseline = Math.round(rainBaseline * 10) / 10;
      const temp = tempBaseline.get(doy);
      if (temp !== undefined) row.tempBaseline = temp;
    }
    rows.set(doy, row);
  }
  const data = [...rows.values()].sort((a, b) => a.doy - b.doy);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 12, right: 24, left: 16, bottom: 0 }}>
        <CartesianGrid stroke={grid.stroke} />
        <XAxis dataKey="doy" tick={axis} tickFormatter={doyLabel} />
        <YAxis
          yAxisId="rain"
          tick={axis}
          width={56}
          label={{
            value: "Cumulative rain (mm)",
            angle: -90,
            position: "insideLeft",
            fill: "#94a3b8",
            fontSize: 12,
          }}
        />
        <YAxis
          yAxisId="temp"
          orientation="right"
          tick={axis}
          width={56}
          label={{
            value: "Max temp, 7-day mean (°C)",
            angle: 90,
            position: "insideRight",
            fill: "#94a3b8",
            fontSize: 12,
          }}
        />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
          labelFormatter={(value) => doyLabel(Number(value))}
        />
        <Legend formatter={(value) => <span style={{ color: "#e2e8f0" }}>{value}</span>} />
        <Line
          yAxisId="rain"
          dataKey="rainEvent"
          name={`${eventYear} rain`}
          stroke="#f59e0b"
          strokeWidth={2.5}
          dot={false}
          connectNulls
        />
        <Line
          yAxisId="rain"
          dataKey="rainBaseline"
          name={`${baselineYear} rain`}
          stroke="#38bdf8"
          strokeWidth={2.5}
          dot={false}
          connectNulls
        />
        <Line
          yAxisId="temp"
          dataKey="tempEvent"
          name={`${eventYear} max temp`}
          stroke="#fb7185"
          strokeDasharray="5 4"
          dot={false}
          strokeWidth={2}
          connectNulls
        />
        <Line
          yAxisId="temp"
          dataKey="tempBaseline"
          name={`${baselineYear} max temp`}
          stroke="#e2e8f0"
          strokeDasharray="5 4"
          dot={false}
          strokeWidth={2}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function rollingMaxTemp(points: DashboardWeather[], year: number): Map<number, number> {
  const daily = points
    .filter((point) => Number(point.date.slice(0, 4)) === year && point.tMaxC !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const means = new Map<number, number>();
  for (const point of daily) {
    const end = Date.parse(`${point.date}T00:00:00Z`);
    const start = end - 6 * 86_400_000;
    const window = daily.filter((day) => {
      const time = Date.parse(`${day.date}T00:00:00Z`);
      return time >= start && time <= end && day.tMaxC !== null;
    });
    if (window.length === 0) continue;
    const mean = window.reduce((sum, day) => sum + (day.tMaxC ?? 0), 0) / window.length;
    means.set(dayOfYear(point.date), Math.round(mean * 10) / 10);
  }
  return means;
}

function dayOfYear(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.round((current - start) / 86_400_000) + 1;
}

function doyLabel(doy: number): string {
  const date = new Date(Date.UTC(2022, 0, doy));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
