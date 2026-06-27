import { GraphQLClient, gql } from "graphql-request";
import type { Auction, AuctionKind, AuctionStatus, PricePoint, ActivityEvent } from "./types";
import { SEED_AUCTIONS, syntheticSeries, syntheticActivity } from "./seed";
import { CHAIN_BY_SLUG, SUPPORTED_CHAIN_IDS } from "./chains";

// ---------------------------------------------------------------------------
// Doppler indexer (Ponder GraphQL) data layer.
//
// The production multichain endpoint is gated ("available on request" per the
// docs). We default to the public test endpoint and ALWAYS fall back to seed
// data so the UI is never empty. Anything sourced from seeds is flagged
// `demo: true` and surfaced as such in the UI.
// ---------------------------------------------------------------------------

const ENDPOINT =
  (process.env.NEXT_PUBLIC_DOPPLER_INDEXER || "https://test.indexer.doppler.lol").replace(/\/$/, "");

function client(): GraphQLClient {
  return new GraphQLClient(`${ENDPOINT}/graphql`);
}

// The indexer is Ponder-generated; `pools` is the auction-bearing entity.
const POOLS_QUERY = gql`
  query Pools($chainId: BigInt!, $limit: Int!) {
    pools(
      where: { chainId: $chainId }
      orderBy: "dollarLiquidity"
      orderDirection: "desc"
      limit: $limit
    ) {
      items {
        address
        chainId
        type
        dollarLiquidity
        volumeUsd
        price
        marketCap
        maxThreshold
        graduationBalance
        createdAt
        baseToken {
          address
          name
          symbol
          image
          decimals
          holderCount
        }
        quoteToken {
          symbol
        }
      }
    }
  }
`;

const POOL_QUERY = gql`
  query Pool($address: String!, $chainId: BigInt!) {
    pool(address: $address, chainId: $chainId) {
      address
      chainId
      type
      dollarLiquidity
      volumeUsd
      price
      marketCap
      maxThreshold
      graduationBalance
      createdAt
      baseToken {
        address
        name
        symbol
        image
        decimals
        holderCount
      }
      quoteToken {
        symbol
      }
    }
  }
`;

function kindFromType(t?: string): AuctionKind {
  switch ((t || "").toLowerCase()) {
    case "v4":
    case "dynamic":
      return "dynamic";
    case "multicurve":
      return "multicurve";
    case "opening":
      return "opening";
    default:
      return "static";
  }
}

function statusFrom(raised: number, target: number, graduated?: boolean): AuctionStatus {
  if (graduated) return "graduated";
  if (target && raised >= target * 0.92) return "graduating";
  return "live";
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizePool(p: any): Auction | null {
  if (!p?.address || !p?.baseToken) return null;
  const raised = num(p.graduationBalance) || num(p.dollarLiquidity);
  const target = num(p.maxThreshold) || raised * 1.5 || 1;
  return {
    address: p.address,
    chainId: num(p.chainId),
    kind: kindFromType(p.type),
    status: statusFrom(raised, target),
    name: p.baseToken.name ?? p.baseToken.symbol ?? "Unknown",
    symbol: p.baseToken.symbol ?? "?",
    image: p.baseToken.image ?? undefined,
    tokenAddress: p.baseToken.address,
    numeraire: p.quoteToken?.symbol ?? "ETH",
    priceUsd: num(p.price),
    marketCapUsd: num(p.marketCap),
    raisedUsd: raised,
    targetUsd: target,
    liquidityUsd: num(p.dollarLiquidity),
    volumeUsd: num(p.volumeUsd),
    holders: p.baseToken.holderCount ? num(p.baseToken.holderCount) : undefined,
    createdAt: p.createdAt ? num(p.createdAt) : undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function tryFetchChain(chainId: number, limit: number): Promise<Auction[]> {
  try {
    const data: any = await client().request(POOLS_QUERY, { chainId, limit });
    const items: any[] = data?.pools?.items ?? [];
    return items.map(normalizePool).filter(Boolean) as Auction[];
  } catch {
    return [];
  }
}

export interface FetchOpts {
  chainIds?: number[];
  limitPerChain?: number;
}

/** Live auctions across chains, with seed fallback. */
export async function fetchAuctions(opts: FetchOpts = {}): Promise<Auction[]> {
  const chainIds = opts.chainIds?.length ? opts.chainIds : SUPPORTED_CHAIN_IDS;
  const limit = opts.limitPerChain ?? 24;

  const results = await Promise.all(chainIds.map((id) => tryFetchChain(id, limit)));
  const live = results.flat();

  if (live.length > 0) return live;

  // Fallback: seed data filtered to requested chains.
  return SEED_AUCTIONS.filter((a) => chainIds.includes(a.chainId));
}

/** Single auction by chain slug + address, with seed fallback. */
export async function fetchAuction(chainSlug: string, address: string): Promise<Auction | undefined> {
  const meta = CHAIN_BY_SLUG[chainSlug];
  if (!meta) return undefined;

  try {
    const data: any = await client().request(POOL_QUERY, {
      address: address.toLowerCase(),
      chainId: meta.chain.id,
    });
    const a = normalizePool(data?.pool);
    if (a) return a;
  } catch {
    /* fall through to seed */
  }

  return SEED_AUCTIONS.find(
    (s) => s.chainId === meta.chain.id && s.address.toLowerCase() === address.toLowerCase(),
  );
}

/**
 * Price series for the chart. Real swaps would come from the indexer's `swaps`
 * entity; until the prod endpoint is wired we synthesize a deterministic series
 * from the auction's shape. Demo auctions always synthesize.
 */
export function priceSeries(a: Auction): PricePoint[] {
  return syntheticSeries(a);
}

export function activity(a: Auction): ActivityEvent[] {
  return syntheticActivity(a);
}

export { SEED_AUCTIONS };
