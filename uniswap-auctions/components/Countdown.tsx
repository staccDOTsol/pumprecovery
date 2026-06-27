"use client";

import { useEffect, useState } from "react";
import { timeLeft } from "@/lib/format";

export function Countdown({ endsAt, className = "" }: { endsAt?: number; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  return <span className={className}>{timeLeft(endsAt)}</span>;
}
