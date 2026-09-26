/** Browser origin for QR codes and share links. Never hardcode localhost. */
export function appOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  return "";
}

export function absoluteUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const origin = appOrigin();
  return origin ? `${origin}${suffix}` : suffix;
}

export function demoForced(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

export function pttForced(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("ptt") === "1";
}

export function writePttParam(enabled: boolean): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (enabled) url.searchParams.set("ptt", "1");
  else url.searchParams.delete("ptt");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
