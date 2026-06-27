import { parseEther } from "viem";
import type { Auction } from "./types";

// ---------------------------------------------------------------------------
// On-chain bidding (= buying into a live Continuous Clearing Auction by swapping
// the numeraire for the auction token through the Doppler v4 hook/pool).
//
// The Doppler SDK (@whetstone-research/doppler-sdk) is an OPTIONAL dependency: it
// pulls in heavy Solana deps, so we load it lazily and only when a real bid is
// submitted. The core app builds and runs without it (demo auctions simulate).
// ---------------------------------------------------------------------------

export interface QuoteResult {
  amountInEth: number;
  /** estimated tokens received (UI-side estimate from spot price) */
  amountOutTokens: number;
  priceUsd: number;
}

/** Cheap client-side quote from spot price — replace with SDK quoter for exactness. */
export function quoteBid(auction: Auction, amountInNumeraire: number, numerairePriceUsd = 1): QuoteResult {
  const inUsd = amountInNumeraire * numerairePriceUsd;
  const tokens = auction.priceUsd > 0 ? inUsd / auction.priceUsd : 0;
  return { amountInEth: amountInNumeraire, amountOutTokens: tokens, priceUsd: auction.priceUsd };
}

export class BidError extends Error {}

export interface PlaceBidArgs {
  auction: Auction;
  amountInNumeraire: string; // human units, e.g. "0.5"
  // viem clients from wagmi — typed loosely, they're handed straight to the SDK.
  walletClient: any;
  publicClient: any;
  account: `0x${string}`;
  slippageBps?: number;
}

/**
 * Execute a real bid. Demo auctions short-circuit to a simulated tx hash so the
 * UI is fully clickable without funds. Real auctions route through the Doppler
 * SDK; if it isn't installed we throw a precise, actionable error rather than a
 * fabricated success.
 */
export async function placeBid(args: PlaceBidArgs): Promise<{ hash: string; simulated: boolean }> {
  const { auction, amountInNumeraire } = args;
  const amount = parseEther(amountInNumeraire || "0");
  if (amount <= 0n) throw new BidError("Enter an amount greater than 0.");

  if (auction.demo) {
    // Simulated settlement for demo/seed auctions.
    await new Promise((r) => setTimeout(r, 900));
    return { hash: `0xsimulated${Math.abs(Number(amount % 100000n))}`, simulated: true };
  }

  let sdkmod: any;
  try {
    // Hidden from webpack static analysis so `next build` succeeds without the
    // optional dep installed; resolves (or throws → caught) at runtime.
    const dynImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;
    sdkmod = await dynImport("@whetstone-research/doppler-sdk/evm");
  } catch {
    throw new BidError(
      "On-chain bidding needs the Doppler SDK. Run `pnpm add @whetstone-research/doppler-sdk`, then this routes the swap through the auction's v4 hook.",
    );
  }

  const { DopplerSDK } = sdkmod;
  const sdk = new DopplerSDK({
    publicClient: args.publicClient,
    walletClient: args.walletClient,
    chainId: auction.chainId,
  });

  // Bind to the on-chain auction entity. Dynamic (v4 hook) vs static (v3 pool)
  // use different getters; the resolved entity exposes the swap/buy primitive.
  const entity =
    auction.kind === "static"
      ? await sdk.getStaticAuction(auction.address)
      : await sdk.getDynamicAuction(auction.address);

  // The entity's buy/swap method name is the single integration point. We try the
  // documented surface and surface a clear error if the installed SDK differs.
  const buyFn =
    entity.buy ?? entity.swapExactIn ?? entity.swap ?? entity.bid ?? null;
  if (typeof buyFn !== "function") {
    throw new BidError(
      "Connected to the auction, but this Doppler SDK build doesn't expose a buy() on the entity. Wire entity.<swap method> in lib/trade.ts.",
    );
  }

  const hash: string = await buyFn.call(entity, {
    amountIn: amount,
    recipient: args.account,
    slippageBps: args.slippageBps ?? 300,
  });
  return { hash, simulated: false };
}
