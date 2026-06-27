"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuction } from "@/hooks/useAuctions";
import { priceSeries, activity } from "@/lib/doppler";
import { AuctionChart } from "@/components/AuctionChart";
import { BidBox } from "@/components/BidBox";
import { AuctionProgress } from "@/components/AuctionProgress";
import { ChainBadge } from "@/components/ChainBadge";
import { CopyCa } from "@/components/CopyCa";
import { Countdown } from "@/components/Countdown";
import { usd, price, compact, timeAgo, shortAddr } from "@/lib/format";
import { explorerAddress } from "@/lib/chains";

export default function AuctionPage() {
  const params = useParams<{ chain: string; address: string }>();
  const chain = params.chain;
  const address = params.address;
  const { data: auction, isLoading } = useAuction(chain, address);
  const [tab, setTab] = useState<"activity" | "info">("activity");

  const series = useMemo(() => (auction ? priceSeries(auction) : []), [auction]);
  const events = useMemo(() => (auction ? activity(auction) : []), [auction]);

  if (isLoading) {
    return <div className="text-gray-500 text-sm py-24 text-center">loading auction…</div>;
  }
  if (!auction) {
    return (
      <div className="text-gray-500 text-sm py-24 text-center">
        auction not found.{" "}
        <Link href="/board" className="text-green-300 hover:underline">
          back to board
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <Link href="/board" className="bracket-link text-xs text-gray-400 hover:text-white">
        back
      </Link>

      <div className="flex flex-col lg:flex-row gap-6 mt-3">
        {/* left: chart + activity */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={auction.image || ""} alt={auction.name} className="w-12 h-12 rounded bg-field object-cover" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-100">
                  {auction.name} <span className="text-gray-400">({auction.symbol})</span>
                </h1>
                <ChainBadge chainId={auction.chainId} />
                {auction.demo && (
                  <span className="text-[10px] text-gray-600 border border-gray-700 rounded px-1">demo</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                <CopyCa address={auction.tokenAddress} />
                <span>·</span>
                <span className="text-green-300">{price(auction.priceUsd)}</span>
              </div>
            </div>

            <div className="flex-1" />

            <div className="flex gap-5 text-right">
              <Stat label="mcap" value={usd(auction.marketCapUsd)} />
              <Stat label="volume" value={usd(auction.volumeUsd)} />
              <Stat label="ends in" value={<Countdown endsAt={auction.endsAt} />} />
            </div>
          </div>

          <div className="border border-gray-800 rounded-lg p-2">
            <AuctionChart data={series} />
          </div>

          {/* tabs */}
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => setTab("activity")}
              className={`px-2 py-1 rounded ${tab === "activity" ? "bg-field text-white" : "text-gray-400"}`}
            >
              activity
            </button>
            <button
              onClick={() => setTab("info")}
              className={`px-2 py-1 rounded ${tab === "info" ? "bg-field text-white" : "text-gray-400"}`}
            >
              info
            </button>
          </div>

          {tab === "activity" ? (
            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="text-gray-500 bg-field/40">
                  <tr>
                    <th className="text-left font-normal px-3 py-2">type</th>
                    <th className="text-left font-normal px-3 py-2">account</th>
                    <th className="text-right font-normal px-3 py-2">{auction.numeraire}</th>
                    <th className="text-right font-normal px-3 py-2">{auction.symbol}</th>
                    <th className="text-right font-normal px-3 py-2">time</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i} className="border-t border-gray-800/60">
                      <td className={`px-3 py-2 font-medium ${e.type === "buy" ? "text-green-400" : "text-red-400"}`}>
                        {e.type}
                      </td>
                      <td className="px-3 py-2 text-gray-400">{e.account}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{e.amountNumeraire}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{compact(e.amountToken)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{timeAgo(e.time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-gray-800 rounded-lg p-4 text-sm text-gray-400 grid gap-3">
              {auction.description && <p className="leading-relaxed">{auction.description}</p>}
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <Field label="auction type" value={auction.kind} />
                <Field label="numeraire" value={auction.numeraire} />
                <Field label="holders" value={auction.holders ? compact(auction.holders) : "—"} />
                <Field label="liquidity" value={usd(auction.liquidityUsd)} />
                <Field label="created" value={auction.createdAt ? timeAgo(auction.createdAt) : "—"} />
                <Field label="creator" value={auction.creator ? shortAddr(auction.creator) : "—"} />
              </div>
              {auction.socials && (
                <div className="flex gap-3 text-xs">
                  {auction.socials.twitter && (
                    <a className="bracket-link text-green-300 hover:underline" href={auction.socials.twitter} target="_blank" rel="noreferrer">
                      twitter
                    </a>
                  )}
                  {auction.socials.website && (
                    <a className="bracket-link text-green-300 hover:underline" href={auction.socials.website} target="_blank" rel="noreferrer">
                      website
                    </a>
                  )}
                </div>
              )}
              <a
                className="text-xs text-gray-500 hover:text-green-300"
                href={explorerAddress(auction.chainId, auction.address)}
                target="_blank"
                rel="noreferrer"
              >
                view auction contract ↗
              </a>
            </div>
          )}
        </div>

        {/* right: bid + progress */}
        <div className="w-full lg:w-[340px] flex flex-col gap-3 shrink-0">
          <BidBox auction={auction} />
          <AuctionProgress auction={auction} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm text-gray-200 font-medium">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="text-gray-300">{value}</span>
    </div>
  );
}
