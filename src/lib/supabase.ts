import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const noSession = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/**
 * Publishable key only. Safe to import from client components.
 * Next inlines NEXT_PUBLIC_* only for direct property access, so these reads stay static.
 */
export function createBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
  return createClient(url, key, { auth: noSession });
}

let browserClient: SupabaseClient | null | undefined;

/** Cached publishable client. Null when the public env vars are missing. */
export function getBrowserSupabase(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    browserClient = null;
    return null;
  }
  browserClient = createBrowserClient();
  return browserClient;
}
