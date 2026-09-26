import { NextResponse } from "next/server";
import { rejectIfCrossOrigin, SESSION_SECONDS } from "@/lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints a short-lived xAI realtime token. The browser never sees XAI_API_KEY.
 * https://docs.x.ai/developers/model-capabilities/audio/ephemeral-tokens
 */
export async function POST(request: Request) {
  const forbidden = rejectIfCrossOrigin(request);
  if (forbidden) return forbidden;
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice session is not configured" },
      { status: 500 },
    );
  }

  const upstream = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expires_after: { seconds: SESSION_SECONDS } }),
    cache: "no-store",
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    console.error("[session] xAI client_secrets failed", upstream.status, text.slice(0, 300));
    return NextResponse.json(
      { error: "Could not get a voice token. Try again." },
      { status: 502 },
    );
  }

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    console.error("[session] xAI client_secrets was not JSON");
    return NextResponse.json(
      { error: "Could not get a voice token. Try again." },
      { status: 502 },
    );
  }
}
