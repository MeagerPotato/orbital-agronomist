import { NextResponse } from "next/server";
import { getFarmConfig } from "@/lib/farms";
import { rejectIfCallExpired, rejectIfCrossOrigin } from "@/lib/request-guard";
import { createServerClient } from "@/lib/supabase-server";
import type { Lang } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const forbidden = rejectIfCrossOrigin(request);
  if (forbidden) return forbidden;
  const body = (await request.json().catch(() => null)) as {
    farmId?: string;
    language?: Lang;
    alert?: boolean;
  } | null;
  const farmId = body?.farmId ?? "";
  const language = body?.language;
  const config = getFarmConfig(farmId);
  if (!config) {
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
  const forbidden = rejectIfCrossOrigin(request);
  if (forbidden) return forbidden;
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    language?: Lang;
  } | null;
  const id = body?.id ?? "";
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Invalid call id" }, { status: 400 });
  }
  if (body?.language === "zh" || body?.language === "en") {
    const expired = await rejectIfCallExpired(id);
    if (expired) return expired;
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
  const existing = await supabase.from("farms").select("id").eq("id", farmId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) throw new Error("Farm is not in the database");
}
