import Link from "next/link";
import type { Auction } from "@/lib/types";
import { chainMetaById } from "@/lib/chains";
import { usd, price, timeLeft, shortAddr } from "@/lib/format";
import { AuctionProgress } from "./AuctionProgress";
import { ChainBadge } from "./ChainBadge";

export function AuctionCard({ auction, shake = false }: { auction: Auction; shake?: boolean }) {
  const meta = chainMetaById(auction.chainId);
  const href = `/auction/${meta?.slug ?? auction.chainId}/${auction.address}`;

  return (
    <Link
      href={href}
      className={`block max-h-[320px] overflow-hidden h-fit p-2 border border-transparent hover:border-white rounded transition-colors ${
        shake ? "animate-shake" : ""
      }`}
    >
      <div className="flex gap-3">
        <div className="min-w-[112px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="w-28 h-28 object-cover rounded bg-field"
            src={auction.image || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>"}
            alt={auction.name}
          />
        </div>

        <div className="grid gap-1 h-fit w-full">
          <div className="flex items-center gap-2 flex-wrap">
            <ChainBadge chainId={auction.chainId} />
            <span className="text-[10px] uppercase tracking-wide text-gray-500">{auction.kind}</span>
            {auction.status === "graduating" && (
              <span className="text-[10px] text-yellow-400">● graduating</span>
            )}
            {auction.status === "graduated" && (
              <span className="text-[10px] text-green-500">● graduated</span>
            )}
            {auction.demo && (
              <span className="text-[10px] text-gray-600 border border-gray-700 rounded px-1">demo</span>
            )}
          </div>

          <p className="text-sm leading-tight">
            <span className="font-bold text-gray-100">
              {auction.name} <span className="text-gray-400">({auction.symbol})</span>
            </span>
          </p>

          <p className="text-xs text-green-300 flex gap-3">
            <span>mcap: {usd(auction.marketCapUsd)}</span>
            <span className="text-gray-400">{price(auction.priceUsd)}</span>
          </p>

          <p className="text-[11px] text-gray-500 flex gap-3">
            <span>ends in {timeLeft(auction.endsAt)}</span>
            {auction.creator && <span>by {shortAddr(auction.creator)}</span>}
          </p>

          <div className="mt-1">
            <AuctionProgress auction={auction} compact />
          </div>
        </div>
      </div>
    </Link>
  );
}
