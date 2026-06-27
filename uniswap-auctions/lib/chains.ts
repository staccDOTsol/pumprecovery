import { defineChain, type Chain } from "viem";
import { mainnet, base } from "viem/chains";

// Chains where the Doppler protocol (which powers Uniswap's Continuous Clearing
// Auctions on the Auctions tab) is actually deployed. Airlock addresses are from
// https://docs.doppler.lol/reference/contract-addresses.
// NOTE: Arbitrum is intentionally absent — Doppler is not deployed there.

const rpc = (k: string, fallback: string) =>
  (process.env[`NEXT_PUBLIC_RPC_${k}`] as string) || fallback;

// Defined locally (not relied on from viem/chains) so the build doesn't depend on
// a specific viem version exporting them.
export const unichain = defineChain({
  id: 130,
  name: "Unichain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc("UNICHAIN", "https://mainnet.unichain.org")] } },
  blockExplorers: { default: { name: "Uniscan", url: "https://uniscan.xyz" } },
});

export const ink = defineChain({
  id: 57073,
  name: "Ink",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc("INK", "https://rpc-gel.inkonchain.com")] } },
  blockExplorers: { default: { name: "Ink Explorer", url: "https://explorer.inkonchain.com" } },
});

export const monad = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpc("MONAD", "https://rpc.monad.xyz")] } },
  blockExplorers: { default: { name: "Monad Explorer", url: "https://explorer.monad.xyz" } },
});

export type ChainMeta = {
  chain: Chain;
  /** url-slug used in routes, e.g. /auction/base/0x... */
  slug: string;
  label: string;
  /** short badge label */
  short: string;
  /** accent colour for the chain chip */
  color: string;
  airlock: `0x${string}`;
  explorer: string;
};

export const CHAINS: ChainMeta[] = [
  {
    chain: base,
    slug: "base",
    label: "Base",
    short: "BASE",
    color: "#3b82f6",
    airlock: "0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12",
    explorer: "https://basescan.org",
  },
  {
    chain: mainnet,
    slug: "ethereum",
    label: "Ethereum",
    short: "ETH",
    color: "#627eea",
    airlock: "0xde3599a2ec440b296373a983c85c365da55d9dfa",
    explorer: "https://etherscan.io",
  },
  {
    chain: unichain,
    slug: "unichain",
    label: "Unichain",
    short: "UNI",
    color: "#f50db4",
    airlock: "0x77ebfbae15ad200758e9e2e61597c0b07d731254",
    explorer: "https://uniscan.xyz",
  },
  {
    chain: ink,
    slug: "ink",
    label: "Ink",
    short: "INK",
    color: "#7132f5",
    airlock: "0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12",
    explorer: "https://explorer.inkonchain.com",
  },
  {
    chain: monad,
    slug: "monad",
    label: "Monad",
    short: "MON",
    color: "#836ef9",
    airlock: "0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12",
    explorer: "https://explorer.monad.xyz",
  },
];

export const CHAIN_BY_SLUG: Record<string, ChainMeta> = Object.fromEntries(
  CHAINS.map((c) => [c.slug, c]),
);

export const CHAIN_BY_ID: Record<number, ChainMeta> = Object.fromEntries(
  CHAINS.map((c) => [c.chain.id, c]),
);

export const SUPPORTED_CHAIN_IDS = CHAINS.map((c) => c.chain.id);

export function chainMetaById(id?: number): ChainMeta | undefined {
  return id == null ? undefined : CHAIN_BY_ID[id];
}

export function explorerToken(chainId: number, address: string): string {
  const m = CHAIN_BY_ID[chainId];
  return m ? `${m.explorer}/token/${address}` : "#";
}

export function explorerAddress(chainId: number, address: string): string {
  const m = CHAIN_BY_ID[chainId];
  return m ? `${m.explorer}/address/${address}` : "#";
}
