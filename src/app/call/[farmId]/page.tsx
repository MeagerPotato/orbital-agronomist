import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFarmConfig } from "@/lib/farms";
import { CallScreen } from "./call-screen";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ farmId: string }>;
}): Promise<Metadata> {
  const { farmId } = await params;
  const farm = getFarmConfig(farmId);
  return {
    title: farm ? `Call ${farm.profile.farmerNameEn}` : "Call",
  };
}

export default async function CallPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  if (!getFarmConfig(farmId)) notFound();
  return <CallScreen farmId={farmId} />;
}
