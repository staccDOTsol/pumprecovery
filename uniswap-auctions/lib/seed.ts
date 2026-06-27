import type { Auction, ActivityEvent, PricePoint } from "./types";

// Deterministic demo auctions so the board, detail page and chart always render
// even when the production Doppler indexer endpoint isn't configured. These are
// clearly flagged `demo: true` in the UI. The Base entry uses the real auction
// address from the linked app.uniswap.org Auctions page.

const HOUR = 3600;
const now = 1_750_000_000; // fixed epoch so SSR/CSR match (no Date.now() at module load)

export const SEED_AUCTIONS: Auction[] = [
  {
    address: "0x4d726b71b76B1DBe8344a005894b62632D5DF46b",
    chainId: 8453,
    kind: "dynamic",
    status: "live",
    name: "Clearing",
    symbol: "CLEAR",
    image: "https://api.dicebear.com/9.x/shapes/svg?seed=clear&backgroundColor=86efac",
    description:
      "The reference Continuous Clearing Auction on Base — uniform-price settlement, bot-resistant, auto-seeds a v4 pool at the final cleared price.",
    tokenAddress: "0x4d726b71b76B1DBe8344a005894b62632D5DF46b",
    numeraire: "ETH",
    creator: "0x1a2B3c4D5e6F7081920aBCdeF1234567890aBcDe",
    priceUsd: 0.0042,
    marketCapUsd: 4_200_000,
    raisedUsd: 312_000,
    targetUsd: 600_000,
    liquidityUsd: 280_000,
    volumeUsd: 1_120_000,
    holders: 842,
    createdAt: now - 6 * HOUR,
    endsAt: now + 18 * HOUR,
    socials: { twitter: "https://twitter.com/Uniswap", website: "https://app.uniswap.org" },
    demo: true,
  },
  {
    address: "0xA11ce0000000000000000000000000000000c0fe",
    chainId: 8453,
    kind: "opening",
    status: "live",
    name: "Based Doppler",
    symbol: "DPLR",
    image: "https://api.dicebear.com/9.x/shapes/svg?seed=doppler&backgroundColor=93c5fd",
    description: "Opening auction → dynamic Dutch curve. Conviction over speed.",
    tokenAddress: "0xA11ce0000000000000000000000000000000c0fe",
    numeraire: "ETH",
    creator: "0xdEAD000000000000000000000000000000000b0b",
    priceUsd: 0.00018,
    marketCapUsd: 1_800_000,
    raisedUsd: 88_500,
    targetUsd: 250_000,
    liquidityUsd: 96_000,
    volumeUsd: 410_000,
    holders: 311,
    createdAt: now - 2 * HOUR,
    endsAt: now + 30 * HOUR,
    demo: true,
  },
  {
    address: "0xUn1c0000000000000000000000000000000000a1".toLowerCase() as string,
    chainId: 130,
    kind: "dynamic",
    status: "live",
    name: "Unicorn Tears",
    symbol: "TEARS",
    image: "https://api.dicebear.com/9.x/shapes/svg?seed=tears&backgroundColor=f9a8d4",
    description: "Pink-pilled price discovery on Unichain.",
    tokenAddress: "0xUn1c0000000000000000000000000000000000a1".toLowerCase() as string,
    numeraire: "ETH",
    priceUsd: 0.0091,
    marketCapUsd: 9_100_000,
    raisedUsd: 540_000,
    targetUsd: 750_000,
    liquidityUsd: 612_000,
    volumeUsd: 3_300_000,
    holders: 1_204,
    createdAt: now - 14 * HOUR,
    endsAt: now + 6 * HOUR,
    demo: true,
  },
  {
    address: "0xE7h0000000000000000000000000000000000d0c".toLowerCase() as string,
    chainId: 1,
    kind: "static",
    status: "graduating",
    name: "Mainnet Maxi",
    symbol: "MAXI",
    image: "https://api.dicebear.com/9.x/shapes/svg?seed=maxi&backgroundColor=fcd34d",
    description: "V3-range static auction, almost at max proceeds.",
    tokenAddress: "0xE7h0000000000000000000000000000000000d0c".toLowerCase() as string,
    numeraire: "USDC",
    priceUsd: 0.21,
    marketCapUsd: 21_000_000,
    raisedUsd: 980_000,
    targetUsd: 1_000_000,
    liquidityUsd: 1_400_000,
    volumeUsd: 7_900_000,
    holders: 3_421,
    createdAt: now - 40 * HOUR,
    endsAt: now + 1 * HOUR,
    demo: true,
  },
  {
    address: "0x1nk0000000000000000000000000000000000e5e".toLowerCase() as string,
    chainId: 57073,
    kind: "multicurve",
    status: "live",
    name: "Ink Splash",
    symbol: "SPLSH",
    image: "https://api.dicebear.com/9.x/shapes/svg?seed=splash&backgroundColor=c4b5fd",
    description: "Multi-curve liquidity, freshly inked.",
    tokenAddress: "0x1nk0000000000000000000000000000000000e5e".toLowerCase() as string,
    numeraire: "ETH",
    priceUsd: 0.00006,
    marketCapUsd: 600_000,
    raisedUsd: 41_000,
    targetUsd: 200_000,
    liquidityUsd: 52_000,
    volumeUsd: 130_000,
    holders: 96,
    createdAt: now - 1 * HOUR,
    endsAt: now + 47 * HOUR,
    demo: true,
  },
  {
    address: "0xM0n0000000000000000000000000000000000f1f".toLowerCase() as string,
    chainId: 143,
    kind: "dynamic",
    status: "live",
    name: "Monad Velocity",
    symbol: "VELO",
    image: "https://api.dicebear.com/9.x/shapes/svg?seed=velo&backgroundColor=a78bfa",
    description: "10k TPS price discovery. Gotta go fast.",
    tokenAddress: "0xM0n0000000000000000000000000000000000f1f".toLowerCase() as string,
    numeraire: "MON",
    priceUsd: 0.0033,
    marketCapUsd: 3_300_000,
    raisedUsd: 175_000,
    targetUsd: 400_000,
    liquidityUsd: 190_000,
    volumeUsd: 880_000,
    holders: 522,
    createdAt: now - 3 * HOUR,
    endsAt: now + 21 * HOUR,
    demo: true,
  },
];

/**
 * Deterministic synthetic price history for an auction. Dynamic/opening auctions
 * use a Dutch-auction shape (high → cleared → demand-driven rise); static ones a
 * gentler climb. Pure function of the auction so SSR and CSR agree.
 */
export function syntheticSeries(a: Auction, points = 80): PricePoint[] {
  const start = a.createdAt ?? now - 24 * HOUR;
  const end = a.endsAt ?? now + 24 * HOUR;
  const span = Math.max(end - start, HOUR);
  const out: PricePoint[] = [];
  // seed PRNG from the address so each token has a stable wiggle
  let h = 0;
  for (let i = 0; i < a.address.length; i++) h = (h * 31 + a.address.charCodeAt(i)) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };
  const dutch = a.kind === "dynamic" || a.kind === "opening";
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    let shape: number;
    if (dutch) {
      // dip to clearing price near the front, then conviction-driven rise
      const clear = 0.45;
      shape = t < clear ? 1 - 0.55 * (t / clear) : 0.45 + 1.1 * ((t - clear) / (1 - clear));
    } else {
      shape = 0.5 + 0.9 * t;
    }
    const noise = 1 + (rand() - 0.5) * 0.08;
    const value = a.priceUsd * shape * noise;
    out.push({ time: Math.floor(start + t * span), value: Math.max(value, a.priceUsd * 0.05) });
  }
  return out;
}

export function syntheticActivity(a: Auction, n = 18): ActivityEvent[] {
  let h = 7;
  for (let i = 0; i < a.symbol.length; i++) h = (h * 33 + a.symbol.charCodeAt(i)) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };
  const out: ActivityEvent[] = [];
  for (let i = 0; i < n; i++) {
    const buy = rand() > 0.32;
    const amtNum = +(rand() * 2 + 0.02).toFixed(4);
    out.push({
      type: buy ? "buy" : "sell",
      account: `0x${Math.floor(rand() * 0xffffff).toString(16).padStart(6, "0")}…${Math.floor(rand() * 0xffff).toString(16).padStart(4, "0")}`,
      amountToken: Math.floor(amtNum / a.priceUsd),
      amountNumeraire: amtNum,
      numeraire: a.numeraire,
      priceUsd: a.priceUsd * (1 + (rand() - 0.5) * 0.05),
      time: (a.createdAt ?? now) + i * 900 + Math.floor(rand() * 600),
      txHash: `0x${Math.floor(rand() * 0xffffffff).toString(16)}`,
    });
  }
  return out.sort((x, y) => y.time - x.time);
}
