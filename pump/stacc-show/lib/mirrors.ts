/**
 * Mirror registry source of truth.
 *
 * Two sources, merged:
 *  1. LIVE self-registered mirrors from the shared backend's indexer
 *     (GET <backend>/mirrors) — mirrors register themselves by virtue of their
 *     users hitting the backend (Origin header) + report their top-level referrer.
 *  2. A baked/env allowlist (NEXT_PUBLIC_MIRRORS) — always-trusted origins.
 *
 * Order = priority (env first, then live by recency). Origins are normalised
 * (no trailing slash) and de-duped.
 */

const DEFAULT_MIRRORS = [
  "https://stacc.art",
  // add always-on origins here or via NEXT_PUBLIC_MIRRORS, highest priority first
];

export const REGISTRY_BRAND =
  process.env.NEXT_PUBLIC_REGISTRY_BRAND?.trim() || "stacc.show";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_CLIENT_API_URL?.trim() ||
  "https://pump-client-server-ddd5e3eed248.herokuapp.com";

export type MirrorEntry = { origin: string; defaultReferrer: string | null };

const norm = (s: string) => s.trim().replace(/\/+$/, "");

function envMirrors(): string[] {
  const env = process.env.NEXT_PUBLIC_MIRRORS;
  const raw = env && env.trim() ? env.split(",") : DEFAULT_MIRRORS;
  return raw.map(norm).filter((s) => /^https?:\/\//.test(s));
}

async function liveMirrors(): Promise<MirrorEntry[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/mirrors`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r: any) => ({
        origin: norm(String(r.origin || "")),
        defaultReferrer: r.default_referrer ? String(r.default_referrer) : null,
      }))
      .filter((e: MirrorEntry) => /^https?:\/\//.test(e.origin));
  } catch {
    return [];
  }
}

/** Merged, de-duped mirror entries (env-trusted first, then live by recency). */
export async function getMirrorEntries(): Promise<MirrorEntry[]> {
  const env: MirrorEntry[] = envMirrors().map((origin) => ({ origin, defaultReferrer: null }));
  const live = await liveMirrors();
  const map = new Map<string, MirrorEntry>();
  for (const e of [...env, ...live]) {
    const prev = map.get(e.origin);
    map.set(e.origin, {
      origin: e.origin,
      defaultReferrer: e.defaultReferrer ?? prev?.defaultReferrer ?? null,
    });
  }
  return Array.from(map.values());
}

export async function getMirrors(): Promise<string[]> {
  return (await getMirrorEntries()).map((e) => e.origin);
}

/** Reachability check (HEAD, GET fallback) with a hard timeout. */
export async function checkMirror(origin: string, timeoutMs = 2500): Promise<boolean> {
  const attempt = async (method: "HEAD" | "GET") => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(origin, {
        method,
        signal: ctrl.signal,
        redirect: "manual",
        cache: "no-store",
      });
      return res.status > 0 && res.status < 500;
    } finally {
      clearTimeout(t);
    }
  };
  try {
    return await attempt("HEAD");
  } catch {
    try {
      return await attempt("GET");
    } catch {
      return false;
    }
  }
}

export type MirrorStatus = MirrorEntry & { ok: boolean };

export async function statusAll(): Promise<MirrorStatus[]> {
  const entries = await getMirrorEntries();
  return Promise.all(
    entries.map(async (e) => ({ ...e, ok: await checkMirror(e.origin) }))
  );
}

/** First healthy mirror by priority; falls back to the first listed if all down. */
export async function pickHealthyMirror(): Promise<string> {
  const origins = await getMirrors();
  if (origins.length === 0) return "https://stacc.art";
  const checks = await Promise.all(
    origins.map(async (origin) => ({ origin, ok: await checkMirror(origin) }))
  );
  return checks.find((c) => c.ok)?.origin ?? origins[0];
}
