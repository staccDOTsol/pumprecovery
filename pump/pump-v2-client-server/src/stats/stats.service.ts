import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from 'src/database/database.service';
import { SolPriceService } from 'src/sol-price/sol-price.service';

/**
 * Per-coin stats served from the SHARED backend (which holds the Supabase +
 * Birdeye credentials), so every mirror can show them without shipping any
 * secrets. Mirrors the old Next /api/coin-flywheel + /api/orca-tvl routes.
 */

const HOUSE_MINT = 'Ha1JzNcMtzffLaivL7b4Wzoj5um7Nctcy529BbbYpump';
const BIRDEYE = 'https://public-api.birdeye.so';
const FEE_BPS = 100; // 1%
const LAMPORTS_PER_SOL = 1e9;

@Injectable()
export class StatsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly solPriceService: SolPriceService,
    private readonly config: ConfigService,
  ) {}

  private beKey(): string | undefined {
    return this.config.get('birdeyeApiKey');
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

  async coinFlywheel(mint: string) {
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
  }

  async orcaTvl(mint: string) {
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
  }
}
