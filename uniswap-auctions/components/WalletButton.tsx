"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { shortAddr } from "@/lib/format";
import { CHAINS, chainMetaById } from "@/lib/chains";
import type { SupportedChainId } from "@/lib/wagmi";
import { Button } from "./ui/button";

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);

  if (!isConnected) {
    return (
      <div className="relative">
        <Button size="sm" onClick={() => setOpen((o) => !o)} disabled={isPending}>
          {isPending ? "connecting…" : "connect wallet"}
        </Button>
        {open && (
          <div className="absolute right-0 mt-1 z-30 bg-field2 border border-gray-700 rounded p-1 min-w-[180px]">
            {connectors.map((c) => (
              <button
                key={c.uid}
                onClick={() => {
                  connect({ connector: c });
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-field rounded"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const meta = chainMetaById(chainId);
  const onSupported = !!meta;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className={`text-xs px-2 py-1 rounded border ${
            onSupported ? "border-gray-700 text-gray-300" : "border-red-500 text-red-400"
          } hover:border-white`}
        >
          {meta ? meta.short : "wrong net"} ▾
        </button>
        {open && (
          <div className="absolute right-0 mt-1 z-30 bg-field2 border border-gray-700 rounded p-1 min-w-[150px]">
            {CHAINS.map((c) => (
              <button
                key={c.chain.id}
                onClick={() => {
                  switchChain({ chainId: c.chain.id as SupportedChainId });
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-field rounded"
              >
                <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => disconnect()}
        className="text-xs px-2 py-1 rounded bg-field text-gray-200 hover:text-white"
        title="disconnect"
      >
        {shortAddr(address)}
      </button>
    </div>
  );
}
