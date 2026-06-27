import { chainMetaById } from "@/lib/chains";

export function ChainBadge({ chainId, className = "" }: { chainId: number; className?: string }) {
  const meta = chainMetaById(chainId);
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${className}`}
      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.short}
    </span>
  );
}
