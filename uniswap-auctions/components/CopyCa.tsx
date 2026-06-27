"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { shortAddr } from "@/lib/format";

export function CopyCa({ address, label = "CA" }: { address: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-green-300 transition-colors"
      title={address}
    >
      <span>
        {label}: {shortAddr(address)}
      </span>
      {copied ? <Check size={12} className="text-green-300" /> : <Copy size={12} />}
    </button>
  );
}
