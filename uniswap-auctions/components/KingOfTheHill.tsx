import Link from "next/link";
import { Crown } from "lucide-react";
import type { Auction } from "@/lib/types";
import { chainMetaById } from "@/lib/chains";
import { usd, price, timeLeft } from "@/lib/format";
import { AuctionProgress } from "./AuctionProgress";
import { ChainBadge } from "./ChainBadge";

export function KingOfTheHill({ auction }: { auction: Auction }) {
  const meta = chainMetaById(auction.chainId);
  const href = `/auction/${meta?.slug ?? auction.chainId}/${auction.address}`;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2 text-yellow-400 text-sm">
        <Crown size={16} />
        <span className="font-bold">king of the hill</span>
        <span className="text-gray-500 text-xs">closest to graduation</span>
      </div>
      <Link
        href={href}
        className="block border border-yellow-500/40 hover:border-yellow-400 rounded-lg p-4 bg-yellow-500/[0.03] transition-colors"
      >
        <div className="flex gap-4 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={auction.image || ""}
            alt={auction.name}
            className="w-20 h-20 rounded object-cover bg-field"
          />
          <div className="flex-1 grid gap-1">
            <div className="flex items-center gap-2">
              <ChainBadge chainId={auction.chainId} />
              <span className="font-bold text-gray-100">
                {auction.name} <span className="text-gray-400">({auction.symbol})</span>
              </span>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-green-300">mcap {usd(auction.marketCapUsd)}</span>
              <span className="text-gray-400">{price(auction.priceUsd)}</span>
              <span className="text-gray-500">ends in {timeLeft(auction.endsAt)}</span>
            </div>
            <div className="mt-1 max-w-md">
              <AuctionProgress auction={auction} compact />
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
