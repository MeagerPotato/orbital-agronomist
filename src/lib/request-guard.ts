import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const SESSION_SECONDS = 300;
export const SESSION_MS = SESSION_SECONDS * 1000;

function normalizeOrigin(value: string): string {
  return value.replace(/\/$/, "");
}

function originMatchesRequestHost(request: Request, origin: string): boolean {
  try {
    const originHost = new URL(origin).host;
    const requestHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
      .split(",")[0]
      .trim();
    return requestHost.length > 0 && originHost === requestHost;
  } catch {
    return false;
  }
}

export function allowedOrigins(): string[] {
  const origins = new Set<string>();
  origins.add("https://orbital-agronomist.vercel.app");
  if (process.env.NODE_ENV !== "production") {
    for (const port of [3000, 3001, 3002, 3003]) {
      origins.add(`http://localhost:${port}`);
      origins.add(`http://127.0.0.1:${port}`);
    }
  }
  for (const raw of [
    process.env.APP_ORIGIN,
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
  ]) {
    if (!raw) continue;
    origins.add(normalizeOrigin(raw.startsWith("http") ? raw : `https://${raw}`));
  }
  return [...origins];
}

export function isAppRequest(request: Request): boolean {
  const allowed = new Set(allowedOrigins());
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return allowed.has(normalizeOrigin(origin)) || originMatchesRequestHost(request, origin);
}

export function rejectIfCrossOrigin(request: Request): NextResponse | null {
  if (isAppRequest(request)) return null;
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function rejectIfCallExpired(callId: string): Promise<NextResponse | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("calls")
    .select("started_at, ended_at")
    .eq("id", callId)
    .maybeSingle();
  if (error || !data?.started_at) {
    return NextResponse.json({ error: "Unknown call" }, { status: 404 });
  }
  const age = Date.now() - Date.parse(String(data.started_at));
  if (age <= SESSION_MS) return null;
  if (!data.ended_at) {
    await supabase.from("calls").update({ ended_at: new Date().toISOString() }).eq("id", callId);
  }
  return NextResponse.json({ error: "Call expired" }, { status: 410 });
}
