import { progressOf, usd, pct } from "@/lib/format";
import type { Auction } from "@/lib/types";

export function AuctionProgress({ auction, compact = false }: { auction: Auction; compact?: boolean }) {
  const p = progressOf(auction.raisedUsd, auction.targetUsd);
  const done = auction.status === "graduated";

  return (
    <div className={compact ? "" : "border border-gray-800 rounded p-3 w-full"}>
      <div className="flex justify-between items-center text-xs mb-1.5">
        <span className="text-gray-400">{done ? "graduated" : "auction progress"}</span>
        <span className="text-green-300 font-bold">{pct(p)}</span>
      </div>
      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-300 transition-all duration-500"
          style={{ width: `${p}%` }}
        />
      </div>
      {!compact && (
        <p className="text-[11px] text-gray-500 mt-2 leading-snug">
          {done ? (
            <>curve complete — trading on a Uniswap v4 pool.</>
          ) : (
            <>
              <span className="text-gray-300">{usd(auction.raisedUsd)}</span> / {usd(auction.targetUsd)} max
              proceeds
            </>
          )}
        </p>
      )}
    </div>
  );
}
