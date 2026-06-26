import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { GetCoinsDto } from './dto/get-coins.dto';
import { Program, AnchorProvider, Idl, utils } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { ConfigService } from '@nestjs/config';
import pumpIdl from '../../idl/pump.json';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { EventListenerService } from 'src/event-listener/event-listener.service';
import { BN } from '@coral-xyz/anchor';
import { Coin } from './entities/coin.entity';
import { SolPriceService } from 'src/sol-price/sol-price.service';
import { TradeEvent } from 'src/candlesticks/events/trade-created.event';
import { lamportsToSol } from 'utils/lamportsToSol';
import { GlobalParamsService } from 'src/global-params/global-params.service';
import sleep from 'sleep-promise';
import { TradesGateway } from 'src/trades/trades.gateway';
import { CoinsGateway } from './coins.gateway';

@Injectable()
export class CoinsService {
  private marketCapLastUpdate: Record<string, number> = {};

  constructor(
    private databaseService: DatabaseService,
    private configService: ConfigService,
    private readonly globalParamsService: GlobalParamsService,
    private readonly coinsGateway: CoinsGateway,
  ) {}

  async getCoinByMint(mint: string) {
    return this.databaseService.getCoinByMint(mint);
  }

  async updateMarketCap(mint: string) {
    console.log('updating market', mint);
    const coin = await this.databaseService.getCoinRaw(mint);
    if (!coin) return;

    let marketCap;
    if (coin.raydium_pool) {
      const UPDATE_INTERVAL = 0;

      if (this.marketCapLastUpdate[coin.mint] + UPDATE_INTERVAL > Date.now()) {
        return;
      }

      this.marketCapLastUpdate[mint] = Date.now();

      // use dexscreener
      const priceNative = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${coin.mint}`,
      )
        .then((response) => response.json())
        .then((data) => {
          const priceNative = data.pairs[0].priceNative;
          return priceNative;
        });

      marketCap =
        priceNative *
        Number(new BN(coin.total_supply).div(new BN(10 ** 6)).toString());
    } else {
      marketCap = await this.calculateMarketCap(
        coin.virtual_sol_reserves,
        coin.virtual_token_reserves,
        coin.total_supply,
      );
    }

    coin.market_cap = marketCap;
    await this.databaseService.updateCoin(coin);
  }

  async createCoin(event: any, slot: number, signature: string, tx: any) {
    console.log('creating coin');
    const { uri, mint, bondingCurve, user } = event;
    const timestamp = tx ? tx.blockTime * 1000 : Date.now();

    const fetchIpfsData = () => {
      return fetch(
        "https://cf-ipfs.com/ipfs/QmW8W35ggYeuf3kx7E3zu6NnBwm5Rt3xZbm9ku3nmLgnVc"
      ).then((res) => res.json());
    };

    const fetchIpfsDataWithRetry = async () => {
      const maxRetryDuration = 120_000; // Maximum retry duration in milliseconds (120 seconds)
      const retryInterval = 10_000; // Retry interval in milliseconds (10 seconds)
      let elapsedTime = 0; // Track the elapsed time

      while (elapsedTime < maxRetryDuration) {
        try {
          const data = await fetchIpfsData(); // Attempt to fetch the data
          return data; // Return the data if fetch is successful
        } catch (error) {
          console.log('Failed to fetch IPFS data, retrying...', error);
          await sleep(retryInterval); // Wait for the retry interval before retrying
          elapsedTime += retryInterval; // Update the elapsed time
        }
      }

      throw new Error('Failed to fetch IPFS data within the retry limit.');
    };

    try {
      // fetch the metadata
      let data;
      try {
        data = await fetchIpfsDataWithRetry();
      } catch (error) {
        console.log(
          'failed to fetch ipfs data, cannot create coin',
          error,
          event,
        );

        throw new Error(error);
      }

      const {
        name,
        symbol,
        description,
        image,
        telegram,
        twitter,
        website,
        showName,
      } = data;

      const associatedBondingCurve = getAssociatedTokenAddressSync(
        new PublicKey(mint),
        new PublicKey(bondingCurve),
        true,
      );

      const {
        initial_virtual_sol_reserves,
        initial_virtual_token_reserves,
        token_total_supply,
      } = await this.globalParamsService.getGlobalParamsAtTimestamp(1711112108000);

      const market_cap = await this.calculateMarketCap(
        initial_virtual_sol_reserves.toString(),
        initial_virtual_token_reserves.toString(),
        token_total_supply.toString(),
      );

      await this.databaseService.createCoin({
        name,
        symbol,
        description: description && description.replace(/[\r\n]+/g, ' '),
        image_uri: image,
        metadata_uri: uri,
        bonding_curve: bondingCurve,
        associated_bonding_curve: associatedBondingCurve.toBase58(),
        mint,
        creator: user,
        created_timestamp: timestamp,
        twitter,
        telegram,
        website,
        complete: false,
        virtual_sol_reserves: initial_virtual_sol_reserves.toString(),
        virtual_token_reserves: initial_virtual_token_reserves.toString(),
        total_supply: token_total_supply.toString(),
        show_name: showName ?? true,
        market_cap,
      });
    } catch (e) {
      console.log('ERROR creating:', event, e);
      return;
    }
  }

  async updateKingOfHillStatus(tradeEvent: TradeEvent) {
    if (tradeEvent.solAmount.lt(new BN(5000000))) return;

    console.log('updating king of hill', tradeEvent);

    const coin = await this.databaseService.getCoinRaw(
      tradeEvent.mint.toBase58(),
    );

    const { virtualSolReserves, virtualTokenReserves, tokenTotalSupply } =
      await this.getBondingCurveDetails(new PublicKey(coin.bonding_curve));

    const marketCap = virtualSolReserves
      .mul(tokenTotalSupply)
      .div(virtualTokenReserves);

    if (
      marketCap.gte(new BN(this.configService.get('kingOfTheHillMarketCap'))) &&
      !coin.king_of_the_hill_timestamp
    ) {
      console.log('crowning coin as king of the hill', coin);
      coin.king_of_the_hill_timestamp = Date.now();
      await this.databaseService.updateCoin(coin);
      this.coinsGateway.emitNewKingOfTheHill(coin);
    }
  }

  async updateCoinLastTradeTimestamp(tradeEvent: TradeEvent) {
    if (tradeEvent.solAmount.lt(new BN(5000000))) return;

    console.log('updating', tradeEvent.mint.toBase58());
    const coin = await this.databaseService.getCoinRaw(
      tradeEvent.mint.toBase58(),
    );
    coin.last_trade_timestamp = Date.now();
    await this.databaseService.updateCoin(coin);
  }

  async getBondingCurveDetails(bondingCurveId: PublicKey): Promise<any> {
    const connection = new Connection(
      this.configService.get<string>('solanaRpcUrl3'),
    );
    const wallet = null;
    const anchorProvider = new AnchorProvider(connection, wallet as any, {});
    const pumpProgram = new Program(
      pumpIdl as unknown as Idl,
      new PublicKey(this.configService.get<string>('pumpProgramId')),
      anchorProvider,
    );

    const bondingCurve =
      await pumpProgram.account.bondingCurve.fetch(bondingCurveId);
    return bondingCurve;
  }

  async calculateMarketCap(
    virtualSolReserves: string,
    virtualTokenReserves: string,
    tokenTotalSupply: string,
  ): Promise<number> {
    const marketCapBN = new BN(tokenTotalSupply)
      .mul(new BN(virtualSolReserves))
      .div(new BN(virtualTokenReserves));

    return lamportsToSol(marketCapBN);
  }
}
