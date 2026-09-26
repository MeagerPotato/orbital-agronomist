import { NextResponse } from "next/server";
import { getFixture } from "@/lib/fixtures";
import { getFarmConfig } from "@/lib/farms";
import { createServerClient } from "@/lib/supabase";
import type { Lang } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    farmId?: string;
    language?: Lang;
    alert?: boolean;
  } | null;
  const farmId = body?.farmId ?? "";
  const language = body?.language;
  const config = getFarmConfig(farmId);
  if (!config || !getFixture(farmId)) {
    return NextResponse.json({ error: "Unknown farm" }, { status: 404 });
  }
  if (body?.alert === true) {
    return createAlertCall(farmId, config.profile.primaryLanguage);
  }
  if (!language || !config.profile.languages.includes(language)) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    await ensureFarmRow(farmId);
    const { data, error } = await supabase
      .from("calls")
      .insert({ farm_id: farmId, language })
      .select("id")
      .single();
    if (error || !data?.id) {
      console.error("[calls] insert failed", error?.message);
      return NextResponse.json({ error: "Could not open a call record" }, { status: 500 });
    }
    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error("[calls] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not open a call record" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    language?: Lang;
  } | null;
  const id = body?.id ?? "";
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Invalid call id" }, { status: 400 });
  }
  if (body?.language === "zh" || body?.language === "en") {
    try {
      const supabase = createServerClient();
      const { error } = await supabase.from("calls").update({ language: body.language }).eq("id", id);
      if (error) {
        console.error("[calls] language failed", error.message);
        return NextResponse.json({ error: "Could not update the call" }, { status: 500 });
      }
      return NextResponse.json({ id, language: body.language });
    } catch (error) {
      console.error("[calls] language failed", error instanceof Error ? error.message : error);
      return NextResponse.json({ error: "Could not update the call" }, { status: 500 });
    }
  }
  try {
    const supabase = createServerClient();
    const ended_at = new Date().toISOString();
    const { error } = await supabase
      .from("calls")
      .update({ ended_at })
      .eq("id", id)
      .is("ended_at", null);
    if (error) {
      console.error("[calls] end failed", error.message);
      return NextResponse.json({ error: "Could not end the call" }, { status: 500 });
    }
    return NextResponse.json({ id, ended_at });
  } catch (error) {
    console.error("[calls] end failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not end the call" }, { status: 500 });
  }
}

async function createAlertCall(farmId: string, language: Lang) {
  try {
    const supabase = createServerClient();
    await ensureFarmRow(farmId);
    const { data, error } = await supabase
      .from("calls")
      .insert({ farm_id: farmId, language })
      .select("id")
      .single();
    if (error || !data?.id) {
      console.error("[calls] alert insert failed", error?.message);
      return NextResponse.json({ error: "Could not open a call record" }, { status: 500 });
    }
    const event = await supabase.from("call_events").insert({
      call_id: data.id,
      type: "status",
      payload: { alert: true },
    });
    if (event.error) {
      console.error("[calls] alert event failed", event.error.message);
      return NextResponse.json({ error: "Could not send the drought alert" }, { status: 500 });
    }
    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error("[calls] alert failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not send the drought alert" }, { status: 500 });
  }
}

async function ensureFarmRow(farmId: string): Promise<void> {
  const supabase = createServerClient();
  const existing = await supabase
    .from("farms")
    .select("id, derived")
    .eq("id", farmId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return;

  const fixture = getFixture(farmId);
  const config = getFarmConfig(farmId);
  if (!fixture || !config) throw new Error("Unknown farm");

  const { error } = await supabase.from("farms").insert({
    id: farmId,
    profile: {
      ...fixture.profile,
      farmerName: config.profile.farmerName,
      farmerNameEn: config.profile.farmerNameEn,
      region: config.profile.region,
      country: config.profile.country,
      crop: config.profile.crop,
      languages: config.profile.languages,
      event: config.profile.event,
      fictional: true,
      ...(fixture.placeholder ? { fixture: "FAKE" } : {}),
    },
    polygon: fixture.polygon,
    simulated_today: fixture.simulatedToday,
    baseline_year: config.baselineYear,
    derived: fixture.placeholder
      ? { ...fixture.derived, fixture: "FAKE" }
      : fixture.derived,
    sources: fixture.sources,
  });
  if (!error) return;

  const again = await supabase.from("farms").select("id").eq("id", farmId).maybeSingle();
  if (!again.data) throw new Error(error.message);
}
