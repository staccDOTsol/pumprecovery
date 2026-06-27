export function shortAddr(addr?: string, lead = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= lead + tail + 2) return addr;
  return `${addr.slice(0, lead + 2)}…${addr.slice(-tail)}`;
}

export function usd(n?: number): string {
  if (n == null || !isFinite(n)) return "$0";
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  if (a >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(2)}`;
}

export function price(n?: number): string {
  if (n == null || !isFinite(n)) return "$0";
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

export function pct(n: number): string {
  return `${Math.max(0, Math.min(100, n)).toFixed(1)}%`;
}

export function compact(n?: number): string {
  if (n == null) return "0";
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

/** "2h 14m" style countdown from now to a unix-seconds target */
export function timeLeft(endsAt?: number, nowMs = Date.now()): string {
  if (!endsAt) return "—";
  let s = Math.floor(endsAt - nowMs / 1000);
  if (s <= 0) return "ended";
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function timeAgo(at?: number, nowMs = Date.now()): string {
  if (!at) return "";
  let s = Math.floor(nowMs / 1000 - at);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** progress toward graduation, 0..100 */
export function progressOf(raisedUsd: number, targetUsd: number): number {
  if (!targetUsd) return 0;
  return Math.max(0, Math.min(100, (raisedUsd / targetUsd) * 100));
}
