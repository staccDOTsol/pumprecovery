/**
 * Brand / identity resolution so the app is mirror-friendly: the same build can
 * run on stacc.art or any fork/mirror domain and present itself correctly.
 *
 * Priority for the DISPLAY brand:
 *   1. NEXT_PUBLIC_BRAND env (explicit override, set per-deploy)
 *   2. the current hostname (the URL bar) — so a mirror shows its own domain
 *   3. FALLBACK_BRAND
 *
 * This module is isomorphic (no React) so it can be imported by both server and
 * client components. The React hook lives in ./useBrand (client-only).
 *
 * The SIGN-IN brand is intentionally separate: it's verified server-side by the
 * SHARED backend, so it must NOT vary per-mirror or login breaks. It defaults to
 * a neutral string and should match one the backend accepts.
 */

export const FALLBACK_BRAND = "stacc.art";

export const envBrand = (): string => process.env.NEXT_PUBLIC_BRAND?.trim() || "";
export const cleanHost = (h?: string | null): string => (h || "").replace(/^www\./, "");

/** Isomorphic display brand. On the client, falls back to the URL-bar hostname. */
export function getBrand(): string {
  const env = envBrand();
  if (env) return env;
  if (typeof window !== "undefined") {
    const h = cleanHost(window.location?.hostname);
    if (h) return h;
  }
  return FALLBACK_BRAND;
}

/** Canonical origin (no trailing slash) for links, OG tags, metadataBase, etc. */
export function getBrandOrigin(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return `https://${getBrand()}`;
}

/**
 * Sign-in challenge brand. Verified by the shared backend (auth.service.ts),
 * which accepts any "Sign in to <brand>: <ts>"-shaped message plus this neutral
 * default — so mirrors work without redeploying the backend.
 */
export const SIGNIN_BRAND =
  process.env.NEXT_PUBLIC_SIGNIN_BRAND?.trim() || "Pump ICO mirror";
