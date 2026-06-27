"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuctions } from "@/hooks/useAuctions";
import { AuctionCard } from "@/components/AuctionCard";
import { KingOfTheHill } from "@/components/KingOfTheHill";
import { CHAINS } from "@/lib/chains";
import { progressOf } from "@/lib/format";
import type { Auction } from "@/lib/types";

type Sort = "progress" | "marketcap" | "volume" | "new" | "ending";

const SORTS: { value: Sort; label: string }[] = [
  { value: "progress", label: "sort: graduation %" },
  { value: "marketcap", label: "sort: market cap" },
  { value: "volume", label: "sort: volume" },
  { value: "new", label: "sort: newest" },
  { value: "ending", label: "sort: ending soon" },
];

function sortAuctions(list: Auction[], sort: Sort): Auction[] {
  const a = [...list];
  switch (sort) {
    case "progress":
      return a.sort((x, y) => progressOf(y.raisedUsd, y.targetUsd) - progressOf(x.raisedUsd, x.targetUsd));
    case "marketcap":
      return a.sort((x, y) => y.marketCapUsd - x.marketCapUsd);
    case "volume":
      return a.sort((x, y) => y.volumeUsd - x.volumeUsd);
    case "new":
      return a.sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0));
    case "ending":
      return a.sort((x, y) => (x.endsAt ?? Infinity) - (y.endsAt ?? Infinity));
  }
}

export default function BoardPage() {
  const { data, isLoading, isError } = useAuctions();
  const [activeChains, setActiveChains] = useState<number[]>([]);
  const [sort, setSort] = useState<Sort>("progress");
  const [search, setSearch] = useState("");

  const all = data ?? [];
  const usingDemo = all.length > 0 && all.every((a) => a.demo);

  const filtered = useMemo(() => {
    let list = all;
    if (activeChains.length) list = list.filter((a) => activeChains.includes(a.chainId));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.symbol.toLowerCase().includes(q) ||
          a.address.toLowerCase().includes(q),
      );
    }
    return sortAuctions(list, sort);
  }, [all, activeChains, search, sort]);

  const king = useMemo(() => {
    const live = (data ?? []).filter((a) => a.status !== "graduated");
    return sortAuctions(live, "progress")[0];
  }, [data]);

  function toggleChain(id: number) {
    setActiveChains((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  return (
    <div className="pt-2">
      {/* hero */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-black text-gray-100">
            continuous clearing auctions
          </h1>
          <p className="text-sm text-gray-500">
            uniform-price, bot-resistant token launches on Uniswap v4 — pump.fun style.
          </p>
        </div>
        <Link
          href="/create"
          className="bg-green-400 hover:bg-green-300 text-primary font-bold text-sm px-4 py-2 rounded"
        >
          start an auction
        </Link>
      </div>

      {usingDemo && (
        <div className="mb-4 text-xs text-yellow-400/90 bg-yellow-500/[0.06] border border-yellow-500/20 rounded px-3 py-2">
          Showing <b>demo auctions</b> — set <code className="text-yellow-300">NEXT_PUBLIC_DOPPLER_INDEXER</code>{" "}
          to a live Doppler indexer endpoint to load real on-chain auctions.
        </div>
      )}

      {/* controls */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <button
          onClick={() => setActiveChains([])}
          className={`text-xs px-2.5 py-1 rounded border ${
            activeChains.length === 0 ? "border-green-300 text-green-300" : "border-gray-700 text-gray-400"
          }`}
        >
          all chains
        </button>
        {CHAINS.map((c) => (
          <button
            key={c.chain.id}
            onClick={() => toggleChain(c.chain.id)}
            className="text-xs px-2.5 py-1 rounded border flex items-center gap-1.5"
            style={{
              borderColor: activeChains.includes(c.chain.id) ? c.color : "#374151",
              color: activeChains.includes(c.chain.id) ? c.color : "#9ca3af",
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
            {c.label}
          </button>
        ))}

        <div className="flex-1" />

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search name / ticker / CA"
          className="bg-green-300 text-black placeholder-black/60 text-sm px-3 py-1.5 rounded w-full max-w-[260px] outline-none"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="bg-green-300 text-black text-sm px-2 py-1.5 rounded outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {king && !search && activeChains.length === 0 && <KingOfTheHill auction={king} />}

      {isLoading ? (
        <div className="text-gray-500 text-sm py-20 text-center">loading auctions…</div>
      ) : isError ? (
        <div className="text-red-400 text-sm py-20 text-center">failed to load auctions.</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500 text-sm py-20 text-center">no auctions match.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((a) => (
            <AuctionCard key={`${a.chainId}-${a.address}`} auction={a} />
          ))}
        </div>
      )}
    </div>
  );
}
