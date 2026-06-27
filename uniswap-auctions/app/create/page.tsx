"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useConnect, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { CHAINS, chainMetaById } from "@/lib/chains";
import type { SupportedChainId } from "@/lib/wagmi";
import { createAuction, CreateError, type CreateResult } from "@/lib/create";
import { Button } from "@/components/ui/button";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export default function CreatePage() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUri, setImageUri] = useState("");
  const [targetChain, setTargetChain] = useState(CHAINS[0].chain.id);
  const [target, setTarget] = useState("10");
  const [duration, setDuration] = useState(2);

  const publicClient = usePublicClient({ chainId: targetChain as SupportedChainId });
  const [status, setStatus] = useState<{ kind: "idle" | "pending" | "ok" | "err"; msg?: string; result?: CreateResult }>(
    { kind: "idle" },
  );

  const meta = chainMetaById(targetChain);
  const wrongChain = isConnected && chainId !== targetChain;

  async function onDeploy() {
    setStatus({ kind: "pending" });
    try {
      if (!walletClient || !publicClient || !address) throw new CreateError("Connect a wallet first.");
      const result = await createAuction({
        form: {
          name,
          symbol,
          tokenURI: imageUri || "ipfs://",
          description,
          numeraire: ZERO,
          targetProceeds: target,
          durationDays: duration,
          chainId: targetChain,
        },
        walletClient,
        publicClient,
        account: address,
      });
      setStatus({ kind: "ok", result, msg: "auction deployed" });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "deploy failed" });
    }
  }

  const labelCls = "mb-1 text-sm font-semibold text-blue-400";
  const inputCls = "bg-field2 border border-gray-700 rounded-md p-2 text-white outline-none focus:border-green-400";

  return (
    <div className="flex flex-col items-center mt-6">
      <Link href="/board" className="bracket-link text-sm text-gray-400 hover:text-white self-start">
        go back
      </Link>

      <div className="w-full max-w-[460px] mt-2">
        <h1 className="text-xl font-black text-gray-100 mb-1">start a clearing auction</h1>
        <p className="text-xs text-gray-500 mb-5">
          deploys a Uniswap v4 dynamic Dutch auction (Doppler). uniform clearing price → auto-seeded pool at
          graduation.
        </p>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            <label className={labelCls} htmlFor="name">name</label>
            <input id="name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Clearing Coin" />
          </div>

          <div className="flex flex-col">
            <label className={labelCls} htmlFor="ticker">ticker</label>
            <input id="ticker" className={inputCls} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="CLEAR" maxLength={10} />
          </div>

          <div className="flex flex-col">
            <label className={labelCls} htmlFor="desc">description</label>
            <textarea id="desc" className={`${inputCls} h-24`} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="flex flex-col">
            <label className={labelCls} htmlFor="image">image / metadata URI</label>
            <input id="image" className={inputCls} value={imageUri} onChange={(e) => setImageUri(e.target.value)} placeholder="ipfs://… or https://…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <label className={labelCls}>chain</label>
              <select
                className={inputCls}
                value={targetChain}
                onChange={(e) => setTargetChain(Number(e.target.value))}
              >
                {CHAINS.map((c) => (
                  <option key={c.chain.id} value={c.chain.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className={labelCls}>duration (days)</label>
              <input type="number" min={1} className={inputCls} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
          </div>

          <div className="flex flex-col">
            <label className={labelCls}>max proceeds ({meta?.chain.nativeCurrency.symbol ?? "ETH"})</label>
            <input className={inputCls} value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))} />
            <span className="text-[11px] text-gray-500 mt-1">graduation target — when hit, liquidity auto-seeds a v4 pool.</span>
          </div>

          {!isConnected ? (
            <Button onClick={() => connectors[0] && connect({ connector: connectors[0] })}>connect wallet</Button>
          ) : wrongChain ? (
            <Button variant="outline" onClick={() => switchChain({ chainId: targetChain as SupportedChainId })} disabled={switching}>
              {switching ? "switching…" : `switch to ${meta?.label}`}
            </Button>
          ) : (
            <Button onClick={onDeploy} disabled={status.kind === "pending" || !name || !symbol}>
              {status.kind === "pending" ? "deploying…" : "deploy auction"}
            </Button>
          )}

          {status.kind === "ok" && status.result && (
            <div className="text-xs text-green-400 break-all border border-green-500/30 rounded p-3">
              ✓ {status.msg}
              <div className="text-gray-400 mt-1">token: {status.result.tokenAddress}</div>
              {status.result.hookAddress && <div className="text-gray-400">hook: {status.result.hookAddress}</div>}
            </div>
          )}
          {status.kind === "err" && (
            <p className="text-xs text-red-400 leading-snug border border-red-500/30 rounded p-3">{status.msg}</p>
          )}

          <p className="text-[11px] text-gray-600 leading-relaxed">
            On-chain deployment uses the Doppler SDK (optional dep). Without it / without a funded wallet you can
            still browse and simulate bids on demo auctions.
          </p>
        </div>
      </div>
    </div>
  );
}
