import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { loadDashboard } from "@/lib/dashboard-data";
import { getFarmConfig } from "@/lib/farms";
import { DashboardView } from "./dashboard-view";
import type { FootprintCell } from "./field-map";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  if (!getFarmConfig(farmId)) notFound();
  const data = await loadDashboard(farmId);
  if (!data) notFound();
  const footprint = await loadFootprint(farmId);
  return <DashboardView farmId={farmId} data={data} footprint={footprint} />;
}

async function loadFootprint(farmId: string): Promise<FootprintCell[]> {
  try {
    const text = await readFile(
      path.join(process.cwd(), "data", "farms", farmId, "drought-footprint.json"),
      "utf8",
    );
    const json = JSON.parse(text) as { cells?: FootprintCell[] };
    return Array.isArray(json.cells) ? json.cells : [];
  } catch {
    return [];
  }
}
