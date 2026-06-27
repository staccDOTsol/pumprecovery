"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  useConnect,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import type { Auction } from "@/lib/types";
import { quoteBid, placeBid, BidError } from "@/lib/trade";
import { chainMetaById, explorerAddress } from "@/lib/chains";
import type { SupportedChainId } from "@/lib/wagmi";
import { compact, usd } from "@/lib/format";
import { Button } from "./ui/button";

const PRESETS = ["0.1", "0.5", "1", "5"];

export function BidBox({ auction }: { auction: Auction }) {
  const meta = chainMetaById(auction.chainId);
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const cid = auction.chainId as SupportedChainId;
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: cid });
  const { data: balance } = useBalance({ address, chainId: cid });

  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "pending" | "ok" | "err"; msg?: string; hash?: string }>(
    { kind: "idle" },
  );

  const wrongChain = isConnected && chainId !== auction.chainId;

  const quote = useMemo(() => quoteBid(auction, parseFloat(amount) || 0), [auction, amount]);

  async function onBid() {
    setStatus({ kind: "pending" });
    try {
      if (!walletClient || !publicClient || !address) throw new BidError("Wallet not ready.");
      const res = await placeBid({
        auction,
        amountInNumeraire: amount,
        walletClient,
        publicClient,
        account: address,
      });
      setStatus({
        kind: "ok",
        hash: res.hash,
        msg: res.simulated ? "simulated bid (demo auction)" : "bid submitted",
      });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Bid failed." });
    }
  }

  const graduated = auction.status === "graduated";

  return (
    <div className="bg-field p-4 rounded-lg text-gray-300 grid gap-3 w-full">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-100">place a bid</span>
        <span className="text-[10px] uppercase tracking-wide text-gray-500">{auction.kind} auction</span>
      </div>

      {graduated ? (
        <p className="text-xs text-gray-400 leading-relaxed">
          This auction has graduated. It now trades on a standard Uniswap v4 pool —{" "}
          <a
            className="text-green-300 hover:underline"
            href={`https://app.uniswap.org/explore/tokens/${meta?.slug}/${auction.tokenAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            swap on Uniswap →
          </a>
        </p>
      ) : (
        <>
          <div className="flex items-center rounded-md relative bg-primary">
            <input
              className="bg-transparent text-white outline-none w-full p-3 text-sm"
              placeholder="0.0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
            <span className="text-white text-sm pr-3 font-medium">{auction.numeraire}</span>
          </div>

          <div className="flex gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className="flex-1 text-xs py-1 rounded bg-primary hover:bg-field2 text-gray-300"
              >
                {p}
              </button>
            ))}
          </div>

          {parseFloat(amount) > 0 && (
            <div className="text-xs text-gray-400">
              ≈ <span className="text-green-300">{compact(quote.amountOutTokens)}</span> {auction.symbol}
              <span className="text-gray-600"> · uniform clearing price</span>
            </div>
          )}

          {!isConnected ? (
            <Button onClick={() => connectors[0] && connect({ connector: connectors[0] })}>
              connect wallet
            </Button>
          ) : wrongChain ? (
            <Button variant="outline" onClick={() => switchChain({ chainId: cid })} disabled={switching}>
              {switching ? "switching…" : `switch to ${meta?.label}`}
            </Button>
          ) : (
            <Button onClick={onBid} disabled={status.kind === "pending" || !(parseFloat(amount) > 0)}>
              {status.kind === "pending" ? "bidding…" : "place bid"}
            </Button>
          )}

          {balance && (
            <p className="text-[11px] text-gray-500">
              balance: {Number(balance.formatted).toFixed(4)} {balance.symbol}
            </p>
          )}
        </>
      )}

      {status.kind === "ok" && (
        <p className="text-xs text-green-400 break-all">
          ✓ {status.msg}
          {status.hash && !status.hash.startsWith("0xsimulated") && (
            <>
              {" "}
              <a
                className="underline"
                href={`${meta?.explorer}/tx/${status.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                view tx
              </a>
            </>
          )}
        </p>
      )}
      {status.kind === "err" && <p className="text-xs text-red-400 leading-snug">{status.msg}</p>}

      <div className="border-t border-gray-800 pt-2 text-[11px] text-gray-500 grid gap-1">
        <div className="flex justify-between">
          <span>raised</span>
          <span className="text-gray-300">{usd(auction.raisedUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span>liquidity</span>
          <span className="text-gray-300">{usd(auction.liquidityUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span>contract</span>
          <a
            className="text-gray-300 hover:text-green-300"
            href={explorerAddress(auction.chainId, auction.address)}
            target="_blank"
            rel="noreferrer"
          >
            {auction.address.slice(0, 10)}…
          </a>
        </div>
      </div>
    </div>
  );
}
