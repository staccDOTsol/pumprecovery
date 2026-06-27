import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicKey } from '@solana/web3.js';
import { DatabaseService } from 'src/database/database.service';
import { SolPriceService } from 'src/sol-price/sol-price.service';
import { SolProviderService } from 'src/sol-provider/sol-provider.service';

/**
 * Per-coin + platform-wide stats served from the SHARED backend (which holds the
 * Supabase + Birdeye credentials), so every mirror can show them without
 * shipping any secrets. Mirrors the old Next /api/coin-flywheel, /api/orca-tvl,
 * /api/global-stats routes. Results are cached in-memory so the heavy aggregate
 * doesn't recompute (or hammer Birdeye) on every request.
 */

const HOUSE_MINT = 'Ha1JzNcMtzffLaivL7b4Wzoj5um7Nctcy529BbbYpump';
const HOUSE_ORIGINAL_SUPPLY = 1_000_000_000;
const BIRDEYE = 'https://public-api.birdeye.so';
const FEE_BPS = 100; // 1%
const LAMPORTS_PER_SOL = 1e9;
const MAX_COINS = 150;

@Injectable()
export class StatsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly solPriceService: SolPriceService,
    private readonly solProvider: SolProviderService,
    private readonly config: ConfigService,
  ) {}

  private cacheStore = new Map<string, { at: number; data: any }>();
  private async cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.cacheStore.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.data;
    const data = await fn();
    this.cacheStore.set(key, { at: Date.now(), data });
    return data;
  }

  private beKey(): string | undefined {
    return this.config.get('birdeyeApiKey');
  }

  private async birdeyeOverview(mint: string): Promise<any> {
    const key = this.beKey();
    if (!key) return null;
    try {
      const r = await fetch(`${BIRDEYE}/defi/token_overview?address=${mint}`, {
        headers: {
          'X-API-KEY': key,
          'x-chain': 'solana',
          accept: 'application/json',
        },
      });
      if (!r.ok) return null;
      return (await r.json())?.data ?? null;
    } catch {
      return null;
    }
  }

  /** Paginated full-table read via the Supabase client (service role). */
  private async allRows(table: string, select: string): Promise<any[]> {
    const rows: any[] = [];
    let offset = 0;
    for (;;) {
      const { data, error } = await this.db.supabase
        .from(table)
        .select(select)
        .range(offset, offset + 999);
      if (error || !data || data.length === 0) break;
      rows.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    return rows;
  }

  private async mapLimit<T, R>(
    arr: T[],
    limit: number,
    fn: (x: T) => Promise<R>,
  ): Promise<R[]> {
    const out: R[] = new Array(arr.length);
    let i = 0;
    const workers = Array.from(
      { length: Math.min(limit, arr.length) || 0 },
      async () => {
        while (i < arr.length) {
          const idx = i++;
          out[idx] = await fn(arr[idx]);
        }
      },
    );
    await Promise.all(workers);
    return out;
  }

  /** Sum a coin's trade volume (SOL) from Supabase, handling lamports-vs-SOL. */
  async coinVolumeSol(mint: string): Promise<number> {
    let total = 0;
    let offset = 0;
    let sawLamports = false;
    for (;;) {
      const { data, error } = await this.db.supabase
        .from('trades')
        .select('sol_amount')
        .eq('mint', mint)
        .range(offset, offset + 999);
      if (error || !data || data.length === 0) break;
      for (const t of data) {
        const v = Number((t as any).sol_amount) || 0;
        if (v > 1e6) sawLamports = true;
        total += v;
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
    return sawLamports ? total / LAMPORTS_PER_SOL : total;
  }

  async coinFlywheel(mint: string) {
    return this.cached(`cf:${mint}`, 120_000, async () => {
      const volSol = await this.coinVolumeSol(mint).catch(() => 0);
      const solPrice = this.solPriceService.getPrice().solPrice || 0;
      const houseOv = await this.birdeyeOverview(HOUSE_MINT);
      const housePrice = Number(houseOv?.price) || 0;

      const feesSol = volSol * (FEE_BPS / 10000);
      const refIncomeSol = feesSol / 3;
      const burnSol = feesSol / 3;
      const refIncomeUsd = refIncomeSol * solPrice;
      const burnUsd = burnSol * solPrice;
      const burnTokens = housePrice > 0 ? burnUsd / housePrice : 0;

      return {
        volSol,
        refIncomeSol,
        refIncomeUsd,
        burnUsd,
        burnTokens,
        housePrice,
        solPrice,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async orcaTvl(mint: string) {
    return this.cached(`ot:${mint}`, 60_000, async () => {
      const ov = await this.birdeyeOverview(mint);
      if (!ov) {
        return { tvl: 0, vol: 0, source: 'unavailable', updatedAt: new Date().toISOString() };
      }
      return {
        tvl: Number(ov.liquidity) || 0,
        vol: Number(ov.v24hUSD) || 0,
        source: 'birdeye:token_overview',
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async global() {
    return this.cached('global', 300_000, async () => {
      let totalVolumeSol = 0;
      let vol24Sol = 0;
      let coinMints: string[] = [];
      try {
        const [coins, trades] = await Promise.all([
          this.allRows('coins', 'mint,created_timestamp'),
          this.allRows('trades', 'sol_amount,timestamp'),
        ]);
        coinMints = coins
          .sort(
            (a, b) =>
              Number(b.created_timestamp || 0) - Number(a.created_timestamp || 0),
          )
          .map((c) => c.mint)
          .filter(Boolean)
          .slice(0, MAX_COINS);
        const sample = trades.find((t) => Number(t.sol_amount) > 0);
        const looksLamports = !!sample && Number(sample.sol_amount) > 1e6;
        const toSol = (v: any) => Number(v) / (looksLamports ? LAMPORTS_PER_SOL : 1);
        const cutoff = Math.floor(Date.now() / 1000) - 86400;
        for (const t of trades) {
          const sol = toSol(t.sol_amount);
          totalVolumeSol += sol;
          if (Number(t.timestamp) >= cutoff) vol24Sol += sol;
        }
      } catch {
        /* leave 0 */
      }

      const solPrice = this.solPriceService.getPrice().solPrice || 0;
      const houseOv = await this.birdeyeOverview(HOUSE_MINT);
      const housePrice = Number(houseOv?.price) || 0;
      const overviews = await this.mapLimit(coinMints, 2, (m) =>
        this.birdeyeOverview(m),
      );
      const tvlUsd = overviews.reduce(
        (s, o) => s + (Number(o?.liquidity) || 0),
        0,
      );

      let burnedTokens = 0;
      try {
        const sup = await this.solProvider.dedicatedConnection.getTokenSupply(
          new PublicKey(HOUSE_MINT),
        );
        const current = Number(sup.value.uiAmount) || 0;
        burnedTokens = Math.max(0, HOUSE_ORIGINAL_SUPPLY - current);
      } catch {
        /* leave 0 */
      }

      const feesSol = totalVolumeSol * (FEE_BPS / 10000);
      const refIncomeSol = feesSol / 3;

      return {
        tvlUsd,
        volume24hUsd: vol24Sol * solPrice,
        totalVolumeUsd: totalVolumeSol * solPrice,
        totalVolumeSol,
        refIncomeUsd: refIncomeSol * solPrice,
        refIncomeSol,
        burnedTokens,
        burnedUsd: burnedTokens * housePrice,
        housePrice,
        solPrice,
        coins: coinMints.length,
        updatedAt: new Date().toISOString(),
      };
    });
  }
}
