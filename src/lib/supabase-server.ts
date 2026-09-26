import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const noSession = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/**
 * Secret key. API routes and scripts only. Do not import from client components.
 */
export function createServerClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("createServerClient() cannot run in the browser");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(url, secret, { auth: noSession });
}
