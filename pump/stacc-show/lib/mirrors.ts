/**
 * Mirror registry source of truth.
 *
 * The list is driven by the NEXT_PUBLIC_MIRRORS env (comma-separated origins),
 * with a baked default so the deploy works immediately. Add/remove mirrors by
 * editing the Vercel env — no code change. Origins are normalised (no trailing
 * slash) and de-duped, order = priority.
 */

const DEFAULT_MIRRORS = [
  "https://stacc.art",
  // add mirror origins here (or via NEXT_PUBLIC_MIRRORS), highest priority first:
  // "https://staccmirror.xyz",
  // "https://anotherstacc.app",
];

export const REGISTRY_BRAND =
  process.env.NEXT_PUBLIC_REGISTRY_BRAND?.trim() || "stacc.show";

export function getMirrors(): string[] {
  const env = process.env.NEXT_PUBLIC_MIRRORS;
  const raw = env && env.trim() ? env.split(",") : DEFAULT_MIRRORS;
  const cleaned = raw
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\//.test(s));
  return Array.from(new Set(cleaned));
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
      // Any HTTP response (incl. 3xx) means the host is up. Treat 5xx as down.
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

export type MirrorStatus = { origin: string; ok: boolean };

export async function statusAll(): Promise<MirrorStatus[]> {
  const mirrors = getMirrors();
  return Promise.all(
    mirrors.map(async (origin) => ({ origin, ok: await checkMirror(origin) }))
  );
}

/** First healthy mirror by priority; falls back to the first listed if all down. */
export async function pickHealthyMirror(): Promise<string> {
  const mirrors = getMirrors();
  if (mirrors.length === 0) return "https://stacc.art";
  const checks = await Promise.all(
    mirrors.map(async (origin) => ({ origin, ok: await checkMirror(origin) }))
  );
  return checks.find((c) => c.ok)?.origin ?? mirrors[0];
}
