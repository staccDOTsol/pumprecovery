// Normalized shape the whole UI renders against. Doppler exposes several auction
// flavours (static V3-range, dynamic V4 Dutch, multicurve, opening) — we flatten
// them into one card-friendly model.

export type AuctionStatus = "live" | "graduating" | "graduated";

export type AuctionKind = "dynamic" | "static" | "multicurve" | "opening";

export interface Auction {
  /** pool / hook address — the canonical id within a chain */
  address: string;
  chainId: number;
  kind: AuctionKind;
  status: AuctionStatus;

  name: string;
  symbol: string;
  image?: string;
  description?: string;

  tokenAddress: string;
  /** numeraire (quote) symbol, usually ETH/WETH/USDC */
  numeraire: string;

  creator?: string;

  // economics (all USD unless noted)
  priceUsd: number;
  marketCapUsd: number;
  /** proceeds raised so far in numeraire-USD terms */
  raisedUsd: number;
  /** max proceeds target for the auction (graduation) */
  targetUsd: number;
  liquidityUsd: number;
  volumeUsd: number;

  holders?: number;
  /** unix seconds */
  createdAt?: number;
  /** unix seconds — when the auction ends / graduates */
  endsAt?: number;

  socials?: { twitter?: string; telegram?: string; website?: string };

  /** synthetic when sourced from seed data */
  demo?: boolean;
}

export interface PricePoint {
  /** unix seconds */
  time: number;
  value: number;
}

export interface ActivityEvent {
  type: "buy" | "sell" | "create";
  account: string;
  amountToken: number;
  amountNumeraire: number;
  numeraire: string;
  priceUsd: number;
  time: number;
  txHash?: string;
}
