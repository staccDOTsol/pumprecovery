# uni.fun — Continuous Clearing Auctions, pump.fun style

A pump.fun-**classic** launchpad & explorer for **Uniswap Continuous Clearing Auctions**
(the [Doppler](https://docs.doppler.lol) protocol that powers the
`app.uniswap.org/explore/auctions` tab), across the chains Doppler is actually
deployed on: **Base, Ethereum, Unichain, Ink, Monad**.

Same dark `#1b1d28` / green-300 / `[bracket]`-link aesthetic as
[`pump/pump-v2-frontend`](../pump/pump-v2-frontend), reskinned from Solana bonding
curves to EVM clearing auctions.

> Not affiliated with or endorsed by Uniswap, Doppler/Whetstone, or pump.fun.

## What it does

| Route | What |
| --- | --- |
| `/board` | Explore grid of live auctions across chains — chain filter, sort, search, king-of-the-hill |
| `/auction/[chain]/[address]` | Auction detail — price chart, activity, uniform-price **bid** panel, graduation progress |
| `/create` | Launch a new V4 dynamic Dutch (CCA-style) auction via the Doppler SDK |

## Runs with zero config

The board, detail page and chart render entirely from **seed data** (clearly
flagged `demo`) when no live indexer is configured — including the real Base
auction `0x4d72…F46b`. No RPC, no indexer, no SDK required just to browse and
simulate bids.

```bash
pnpm install
pnpm dev          # http://localhost:3000  → /board
```

## Going live (all optional)

Everything below degrades gracefully if unset.

- **Real auctions** — set `NEXT_PUBLIC_DOPPLER_INDEXER` to a live Doppler
  indexer GraphQL endpoint. The default is the public **test** endpoint
  (Base Sepolia data); the production multichain endpoint is "available on
  request" from Whetstone. Falls back to seed data on any error.
- **On-chain bid / create** — `pnpm add @whetstone-research/doppler-sdk`. It's an
  optional dep, loaded via a runtime-only dynamic import so the app builds
  without it. The single swap/create integration point lives in
  [`lib/trade.ts`](lib/trade.ts) / [`lib/create.ts`](lib/create.ts).
- **Wallet** — injected + Coinbase Wallet work out of the box; set
  `NEXT_PUBLIC_WALLETCONNECT_ID` for WalletConnect.
- **RPCs** — public RPCs are used by default; override per-chain via
  `NEXT_PUBLIC_RPC_*` (see `.env.example`).

## Layout

```
app/
  board/                       explore grid
  auction/[chain]/[address]/   auction detail (chart + bid)
  create/                      launch an auction
lib/
  chains.ts     supported chains + Doppler Airlock addresses
  doppler.ts    indexer GraphQL client + normalization (+ seed fallback)
  seed.ts       deterministic demo auctions + synthetic price/activity
  trade.ts      bid execution (Doppler SDK, optional)
  create.ts     auction creation (Doppler SDK, optional)
  wagmi.ts      multi-chain wagmi config
components/     NavBar, AuctionCard, BidBox, AuctionChart, KingOfTheHill, …
```

## How CCA differs from a pump.fun bonding curve

pump.fun: instant constant-product bonding curve, first-buyer advantage, snipe-able.
CCA (Doppler dynamic auction): an on-chain Dutch auction in a Uniswap v4 hook that
clears at a **uniform price** over epochs — everyone pays the same clear price, so
speed stops mattering and conviction does. At graduation, liquidity auto-seeds a
v4 pool at the final cleared price. This app maps that lifecycle onto the familiar
pump.fun board → detail → trade UX.
