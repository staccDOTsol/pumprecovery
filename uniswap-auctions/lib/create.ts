import { parseEther } from "viem";

// Create a new Continuous Clearing Auction via the Doppler SDK. Optional dep,
// dynamically imported (see lib/trade.ts for the same pattern).

export interface CreateForm {
  name: string;
  symbol: string;
  tokenURI: string; // metadata/image URI
  description?: string;
  numeraire: `0x${string}`; // address(0) => native ETH numeraire on most chains
  /** target raise (max proceeds) in numeraire units, human string */
  targetProceeds: string;
  /** auction duration in days */
  durationDays: number;
  chainId: number;
}

export class CreateError extends Error {}

export interface CreateResult {
  tokenAddress: string;
  poolId?: string;
  hookAddress?: string;
}

export async function createAuction(args: {
  form: CreateForm;
  // viem clients from wagmi — typed loosely, handed straight to the SDK.
  walletClient: any;
  publicClient: any;
  account: `0x${string}`;
}): Promise<CreateResult> {
  const { form } = args;
  if (!form.name || !form.symbol) throw new CreateError("Name and ticker are required.");

  let sdkmod: any;
  try {
    // Hidden from webpack static analysis so `next build` succeeds without the
    // optional dep installed; resolves (or throws → caught) at runtime.
    const dynImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;
    sdkmod = await dynImport("@whetstone-research/doppler-sdk/evm");
  } catch {
    throw new CreateError(
      "Creating an auction needs the Doppler SDK. Run `pnpm add @whetstone-research/doppler-sdk` to enable on-chain deployment.",
    );
  }

  const { DopplerSDK } = sdkmod;
  const sdk = new DopplerSDK({
    publicClient: args.publicClient,
    walletClient: args.walletClient,
    chainId: form.chainId,
  });

  const maxProceeds = parseEther(form.targetProceeds || "10");
  const duration = Math.max(1, form.durationDays) * 86400;

  // Dynamic (V4 Dutch) auction — the CCA-style flavour. The builder surface is
  // documented at https://docs.doppler.lol/reference/api-reference.
  const built = sdk
    .buildDynamicAuction()
    .tokenConfig({ name: form.name, symbol: form.symbol, tokenURI: form.tokenURI, yearlyMintRate: 0n })
    .saleConfig({
      initialSupply: parseEther("1000000000"),
      numTokensToSell: parseEther("800000000"),
      numeraire: form.numeraire,
    })
    .poolConfig({ fee: 3000, tickSpacing: 60 })
    .withMarketCapRange({
      marketCap: { start: maxProceeds / 10n, min: maxProceeds / 100n },
      minProceeds: maxProceeds / 5n,
      maxProceeds,
      duration,
      epochLength: 3600,
    })
    .withGovernance({ type: "default" })
    .withUserAddress(args.account)
    .build();

  const res = await sdk.factory.createDynamicAuction(built);
  return {
    tokenAddress: res.tokenAddress,
    poolId: res.poolId,
    hookAddress: res.hookAddress,
  };
}
