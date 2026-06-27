"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAuctions, fetchAuction } from "@/lib/doppler";

export function useAuctions(chainIds?: number[]) {
  return useQuery({
    queryKey: ["auctions", chainIds ?? "all"],
    queryFn: () => fetchAuctions({ chainIds }),
    refetchInterval: 20_000,
  });
}

export function useAuction(chainSlug: string, address: string) {
  return useQuery({
    queryKey: ["auction", chainSlug, address?.toLowerCase()],
    queryFn: () => fetchAuction(chainSlug, address),
    enabled: !!chainSlug && !!address,
    refetchInterval: 20_000,
  });
}
