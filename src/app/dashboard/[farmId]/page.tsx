import { notFound } from "next/navigation";
import { loadDashboard } from "@/lib/dashboard-data";
import { getFarmConfig } from "@/lib/farms";
import { DashboardView } from "./dashboard-view";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  if (!getFarmConfig(farmId)) notFound();
  const data = await loadDashboard(farmId);
  if (!data) notFound();
  return <DashboardView farmId={farmId} data={data} />;
}
