import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { OnlinePumpAmmSdk, PumpAmmSdk } from "@pump-fun/pump-swap-sdk";
import BN from "bn.js";
import { USDC_MINT, deriveWhirlpool } from "@/constants/venues";
// Optional LP positions registry (mint -> pre-opened Orca position). This file
// is committed as `{}` so the static import NEVER breaks the build; when a real
// registry is dropped in it activates the `add_liq` leg. Access is defensively
// guarded (see `getLpPosition`) so a missing/malformed file just skips add_liq.
import lpPositionsRaw from "../constants/lpPositions.json";

/**
 * On-chain "buy & burn $HOUSE" leg for the per-trade bundle.
 *
 * Mirrors the mainnet-verified recipe in
 *   pump-contracts-solana/scripts/test-bundle-buyburn.js
 *
 * Our pump program's `bundle_buy_burn` instruction buys $HOUSE on PumpSwap
 * (pump AMM) for the program-owned "house_treasury" PDA and burns it. We use
 * @pump-fun/pump-swap-sdk to compute the AMM `buy` ix (args + the 26 AMM
 * accounts) for the treasury, then forward those as remaining_accounts to our
 * instruction. The treasury is forced non-signer at the outer level; the
 * program signs for it via invoke_signed.
 */

// --- Verified mainnet constants ---
export const PUMP_PROGRAM = new PublicKey(
  "67LWrtDBPyZqS7SzCYZWBLgPBqZAG94GTfMWEBG2fnuV"
);
export const PUMP_AMM_PROGRAM = new PublicKey(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);
export const HOUSE_MINT = new PublicKey(
  "Ha1JzNcMtzffLaivL7b4Wzoj5um7Nctcy529BbbYpump"
);
export const WSOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);
export const HOUSE_WSOL_POOL = new PublicKey(
  "9nStgVVCinCyKoBiMGMfCM2iG3TW411EDmUcQqHxL2ek"
);

// Anchor discriminators = sha256("global:<name>")[0..8].
// Hardcoded so we don't pull a sha256 impl into the browser bundle.
const DISC_BUNDLE_BUY_BURN = Buffer.from([
  0x6f, 0xca, 0x5e, 0xce, 0xe4, 0x14, 0xe4, 0x0e,
]);
// `commit` discriminator (from target/idl/pump.json => [223,140,142,165,229,208,156,74]).
// Hardcoded so we don't pull a sha256 impl into the browser bundle.
const DISC_COMMIT = Buffer.from([223, 140, 142, 165, 229, 208, 156, 74]);
const DISC_INIT_BUNDLE_GUARD = Buffer.from([
  0x5a, 0x4f, 0x1d, 0x7e, 0x34, 0x3d, 0x6e, 0x4b,
]);
// pump-AMM `init_user_volume_accumulator` discriminator (from the recipe).
const DISC_INIT_USER_VOLUME = Buffer.from([
  0x5e, 0x06, 0xca, 0x73, 0xff, 0x60, 0xe8, 0xb7,
]);

const findPda = (seeds: (Buffer | Uint8Array)[], programId: PublicKey) =>
  PublicKey.findProgramAddressSync(seeds, programId)[0];

/**
 * Derive the pump-AMM `buy` instruction (and the treasury accounts) for
 * user = house_treasury, via @pump-fun/pump-swap-sdk. This is the SINGLE source
 * of truth for the PumpSwap account set used both by `bundle_buy_burn` and by
 * the HOUSE `add_liq` venue (which forwards the first 23 of these accounts to the
 * program's `buy_exact_quote_in` CPI verbatim).
 *
 * The SDK's `buy` ix lays out the 23 canonical IDL accounts first (pool, user,
 * global_config, base/quote mints, treasury ATAs, pool vaults, fee recipients,
 * token programs, system/ATA programs, event_authority, pump_amm program,
 * coin_creator vault accts, volume accumulators, fee_config, fee_program) and
 * then appends a few extra remaining accounts (poolV2 / buyback recipient). So
 * `buyIx.keys.slice(0, 23)` is exactly the HOUSE venue's PumpSwap account list.
 */
async function deriveHouseBuyIx(
  connection: Connection,
  quoteIn: BN
): Promise<{
  buyIx: TransactionInstruction;
  houseTreasury: PublicKey;
  treasuryWsolAta: PublicKey;
  treasuryHouseAta: PublicKey;
}> {
  const houseTreasury = findPda([Buffer.from("house_treasury")], PUMP_PROGRAM);
  const treasuryWsolAta = getAssociatedTokenAddressSync(
    WSOL_MINT,
    houseTreasury,
    true,
    TOKEN_PROGRAM_ID
  );
  const treasuryHouseAta = getAssociatedTokenAddressSync(
    HOUSE_MINT,
    houseTreasury,
    true,
    TOKEN_2022_PROGRAM_ID
  );

  const online = new OnlinePumpAmmSdk(connection);
  const sdk = new PumpAmmSdk();
  const state = await online.swapSolanaState(
    HOUSE_WSOL_POOL,
    houseTreasury,
    treasuryHouseAta,
    treasuryWsolAta
  );
  const ammIxs = await sdk.buyQuoteInput(state, quoteIn, 1);
  const buyIx = ammIxs.find(
    (i) =>
      i.programId.equals(PUMP_AMM_PROGRAM) && Buffer.from(i.data)[0] === 0x66
  );
  if (!buyIx) throw new Error("no pAMM buy ix found in SDK output");
  return { buyIx, houseTreasury, treasuryWsolAta, treasuryHouseAta };
}

export interface BundleBuyBurnResult {
  /**
   * Idempotent setup instructions that must run BEFORE the buy&burn ix. On
   * mainnet these accounts are already initialized, so this is usually empty.
   */
  setupIxs: TransactionInstruction[];
  /** The assembled `bundle_buy_burn` instruction (11 struct + 26 remaining). */
  buyBurnIx: TransactionInstruction;
}

/**
 * Build the buy&burn leg for `burnLamports` of SOL.
 *
 * @param connection  RPC connection
 * @param walletPubkey  the connected wallet — pays for this leg and signs as `payer`
 * @param burnLamports  amount of SOL (lamports) to spend buying $HOUSE to burn
 *
 * TODO(escrow): for now this leg is funded by the user as an additional bundle
 * leg. The proper design is for the core buy/sell to escrow the burn-third on
 * chain and have the program reconcile/commit it — that escrow/commit
 * reconciliation is a later increment and is NOT implemented here.
 */
export async function buildBundleBuyBurnIx(
  connection: Connection,
  walletPubkey: PublicKey,
  burnLamports: number | BN
): Promise<BundleBuyBurnResult> {
  // Normalize to this module's bn.js instance (the caller may pass an anchor
  // BN, which is a separate copy of bn.js) so the SDK gets a consistent type.
  const escrow = new BN(burnLamports.toString());
  // The on-chain escrow == burnLamports, but the AMM needs quote + slippage +
  // fees for a given base_amount_out, and bundle_buy_burn clamps max_quote_in to
  // the escrow. So we QUOTE the SDK at a discount (90% of escrow) so the
  // resulting max_quote_in always fits WITHIN the escrow ("overpay the escrow"
  // relative to what the base costs). Headroom absorbs the 1% slippage + fees.
  const quoteIn = escrow.muln(9).divn(10);

  // --- Derive PDAs + ATAs (mirror the recipe) ---
  const bundleGuard = findPda([Buffer.from("bundle_guard")], PUMP_PROGRAM);
  const houseTreasury = findPda([Buffer.from("house_treasury")], PUMP_PROGRAM);
  const globalPda = findPda([Buffer.from("global")], PUMP_PROGRAM);

  const treasuryWsolAta = getAssociatedTokenAddressSync(
    WSOL_MINT,
    houseTreasury,
    true,
    TOKEN_PROGRAM_ID
  );
  const treasuryHouseAta = getAssociatedTokenAddressSync(
    HOUSE_MINT,
    houseTreasury,
    true,
    TOKEN_2022_PROGRAM_ID
  );

  const userVolumeAccumulator = findPda(
    [Buffer.from("user_volume_accumulator"), houseTreasury.toBuffer()],
    PUMP_AMM_PROGRAM
  );
  const ammEventAuthority = findPda(
    [Buffer.from("__event_authority")],
    PUMP_AMM_PROGRAM
  );

  // --- Idempotent setup: bundle_guard, treasury ATAs, treasury user_volume_accumulator ---
  // These are already initialized on mainnet, so each existence check normally
  // short-circuits and we return an empty setup list.
  const setupIxs: TransactionInstruction[] = [];

  const [guardInfo, treasuryWsolInfo, treasuryHouseInfo, userVolInfo] =
    await connection.getMultipleAccountsInfo([
      bundleGuard,
      treasuryWsolAta,
      treasuryHouseAta,
      userVolumeAccumulator,
    ]);

  if (!guardInfo) {
    setupIxs.push(
      new TransactionInstruction({
        programId: PUMP_PROGRAM,
        keys: [
          { pubkey: globalPda, isSigner: false, isWritable: false },
          { pubkey: bundleGuard, isSigner: false, isWritable: true },
          { pubkey: walletPubkey, isSigner: true, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: DISC_INIT_BUNDLE_GUARD,
      })
    );
  }

  if (!treasuryWsolInfo) {
    setupIxs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        walletPubkey,
        treasuryWsolAta,
        houseTreasury,
        WSOL_MINT,
        TOKEN_PROGRAM_ID
      )
    );
  }
  if (!treasuryHouseInfo) {
    setupIxs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        walletPubkey,
        treasuryHouseAta,
        houseTreasury,
        HOUSE_MINT,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }
  if (!userVolInfo) {
    setupIxs.push(
      new TransactionInstruction({
        programId: PUMP_AMM_PROGRAM,
        keys: [
          { pubkey: walletPubkey, isSigner: true, isWritable: true },
          { pubkey: houseTreasury, isSigner: false, isWritable: false },
          { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: ammEventAuthority, isSigner: false, isWritable: false },
          { pubkey: PUMP_AMM_PROGRAM, isSigner: false, isWritable: false },
        ],
        data: DISC_INIT_USER_VOLUME,
      })
    );
  }

  // --- SDK: derive the pump-AMM `buy` accounts + args for user = treasury ---
  // Shared with the HOUSE `add_liq` venue (which reuses these exact accounts), so
  // the derivation lives in one place (`deriveHouseBuyIx`).
  const { buyIx } = await deriveHouseBuyIx(connection, quoteIn);

  const data = Buffer.from(buyIx.data);
  // SDK pump-AMM `buy` data layout: [disc(8)][base_amount_out u64 LE][max_quote_in u64 LE].
  // Re-use the raw little-endian bytes verbatim for our instruction args.
  const baseAmountOutLe = data.subarray(8, 16);
  const maxQuoteInLe = data.subarray(16, 24);

  // --- Assemble our bundle_buy_burn: 10 struct accounts + the 26 SDK keys ---
  const m = (pubkey: PublicKey, isWritable: boolean, isSigner = false) => ({
    pubkey,
    isSigner,
    isWritable,
  });
  const structKeys = [
    m(bundleGuard, true), // [0] bundle_guard (W)
    m(walletPubkey, true, true), // [1] payer (W, S)
    m(houseTreasury, false), // [2] house_treasury (r/o PDA)
    m(treasuryWsolAta, true), // [3] treasury_wsol_ata (W)
    m(treasuryHouseAta, true), // [4] treasury_house_ata (W)
    m(HOUSE_MINT, true), // [5] house_mint (W — burn mutates supply)
    m(TOKEN_2022_PROGRAM_ID, false), // [6] token_program (HOUSE = Token-2022)
    m(TOKEN_PROGRAM_ID, false), // [7] wsol_token_program (WSOL = SPL-Token)
    m(SystemProgram.programId, false), // [8] system_program
    m(PUMP_AMM_PROGRAM, false), // [9] pump_amm_program
    // [10] instructions_sysvar — required by the new deployed program for
    // anti-sandwich introspection. Sits AFTER pump_amm_program and BEFORE the
    // 26 AMM remaining accounts.
    m(SYSVAR_INSTRUCTIONS_PUBKEY, false), // [10] instructions_sysvar
  ];

  // Forward the SDK keys, but force the treasury (remaining index 1 = the AMM
  // "user") to non-signer — our program signs for it via invoke_signed.
  const remainingKeys = buyIx.keys.map((k, i) => ({
    pubkey: k.pubkey,
    isWritable: k.isWritable,
    isSigner: i === 1 ? false : k.isSigner,
  }));

  const ixData = Buffer.concat([
    DISC_BUNDLE_BUY_BURN,
    baseAmountOutLe,
    maxQuoteInLe,
  ]);

  const buyBurnIx = new TransactionInstruction({
    programId: PUMP_PROGRAM,
    keys: [...structKeys, ...remainingKeys],
    data: ixData,
  });

  return { setupIxs, buyBurnIx };
}

/**
 * Final leg of the same-slot BUY bundle.
 *
 * The deployed program's `buy` now WITHHOLDS the buyer's tokens in the bonding
 * curve (it only marks STEP_TRADE/STEP_REFERRAL + escrows the burn third) and
 * `bundle_buy_burn` marks STEP_BURN. `commit` verifies the full required mask
 * (TRADE|REFERRAL|BURN) landed this slot for this exact buyer+mint, then
 * releases the withheld tokens to the buyer and resets the guard. It is
 * REQUIRED — without it the buyer never receives their tokens.
 *
 * Accounts (exact order from target/idl/pump.json `commit`):
 *   [0] bundle_guard            (W, PDA [b"bundle_guard"])
 *   [1] mint
 *   [2] bonding_curve           (W, PDA [b"bonding-curve", mint])
 *   [3] associated_bonding_curve(W)
 *   [4] associated_user         (W)
 *   [5] user                    (W, signer)
 *   [6] token_program           (Token-2022)
 *   [7] system_program
 *   [8] instructions_sysvar     (Instructions sysvar; anti-sandwich introspection)
 */
export function buildCommitIx(
  walletPubkey: PublicKey,
  mint: PublicKey,
  bondingCurvePDA: PublicKey,
  associatedBondingCurve: PublicKey,
  associatedUser: PublicKey
): TransactionInstruction {
  const bundleGuard = findPda([Buffer.from("bundle_guard")], PUMP_PROGRAM);

  return new TransactionInstruction({
    programId: PUMP_PROGRAM,
    keys: [
      { pubkey: bundleGuard, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: bondingCurvePDA, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedUser, isSigner: false, isWritable: true },
      { pubkey: walletPubkey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      // [8] instructions_sysvar — required by the new deployed program for
      // anti-sandwich introspection. Appended as the LAST account.
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: DISC_COMMIT,
  });
}

// ---------------------------------------------------------------------------
// add_liq (4th bundle leg): single-sided deposit of the escrowed LP-third into a
// program-owned Orca position, on ONE of three venues:
//   venue 0 (SOL):   deposit WSOL straight into the SOL/meme whirlpool.
//   venue 1 (USDC):  swap escrow WSOL -> USDC on a SOL/USDC whirlpool, then
//                    deposit USDC into the USDC/meme whirlpool.
//   venue 2 (HOUSE): buy $HOUSE with escrow WSOL via the SAME PumpSwap
//                    `buy_exact_quote_in` recipe as bundle_buy_burn, then deposit
//                    HOUSE into the HOUSE/meme whirlpool.
// All three end in the SAME single-sided Orca increase_liquidity; the program
// computes the actual amounts from the swapped/bought balance, so the leading
// tick/liquidity/token_max args only matter for venue 0.
// ---------------------------------------------------------------------------
const ORCA_PROGRAM = new PublicKey("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
// sha256("global:add_liq")[0..8].
const DISC_ADD_LIQ = Buffer.from([241, 142, 78, 129, 234, 250, 48, 236]);

// SOL/USDC whirlpool used to swap the escrow WSOL -> USDC for the USDC venue.
// The on-chain `add_liq_usdc` only requires this be a LIVE Orca whirlpool whose
// two mints are (WSOL, USDC) in either order — it is NOT pinned to a specific
// address — so this is overridable via NEXT_PUBLIC_USDC_SWAP_POOL and otherwise
// defaults to the canonical Orca SOL/USDC pool (tickSpacing 4) under the official
// Whirlpools config. Its live state (mints/vaults/tickSpacing/tickCurrent) is
// read at trade time, so the only requirement on this constant is that it points
// at a real, liquid SOL/USDC Orca pool.
const USDC_SWAP_POOL: PublicKey = (() => {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_USDC_SWAP_POOL
      : undefined;
  if (fromEnv) {
    try {
      return new PublicKey(fromEnv);
    } catch {
      /* fall through to the derived default */
    }
  }
  return deriveWhirlpool(WSOL_MINT, USDC_MINT, 4);
})();

/** One venue's pre-opened Orca position + its `increase_liquidity` deposit accounts. */
export interface VenuePosition {
  whirlpool: string; position: string; positionMint: string;
  positionTokenAccount: string; tickArrayLower: string; tickArrayUpper: string;
  tickLowerIndex: number; tickUpperIndex: number;
  tokenMintA: string; tokenMintB: string; tokenVaultA: string; tokenVaultB: string;
  tokenProgramA: string; tokenProgramB: string;
  tokenOwnerAccountA: string; tokenOwnerAccountB: string;
}

/** Per-mint registry entry: up to one pre-opened position per venue. */
export interface LpPositions {
  sol?: VenuePosition;
  usdc?: VenuePosition;
  house?: VenuePosition;
}

export type Venue = 0 | 1 | 2;
const VENUE_KEY: Record<Venue, keyof LpPositions> = { 0: "sol", 1: "usdc", 2: "house" };

const isVenuePosition = (e: unknown): e is VenuePosition =>
  !!e &&
  typeof e === "object" &&
  typeof (e as VenuePosition).whirlpool === "string" &&
  typeof (e as VenuePosition).position === "string";

/**
 * Defensive registry lookup. Returns the per-venue shape (`{ sol?, usdc?, house? }`)
 * or null when nothing usable is present, so the caller just skips add_liq.
 *
 * Back-compat: an OLD flat entry (the bare SOL VenuePosition shape, before the
 * per-venue refactor) is transparently surfaced as `{ sol: <entry> }` so a stale
 * `constants/lpPositions.json` never breaks the build or the lookup.
 */
export function getLpPosition(mint: string): LpPositions | null {
  try {
    const reg = lpPositionsRaw as Record<string, unknown>;
    const raw = reg?.[mint];
    if (!raw || typeof raw !== "object") return null;
    // Old flat shape -> treat as the SOL venue.
    if (isVenuePosition(raw)) return { sol: raw };
    const entry = raw as LpPositions;
    const out: LpPositions = {};
    if (isVenuePosition(entry.sol)) out.sol = entry.sol;
    if (isVenuePosition(entry.usdc)) out.usdc = entry.usdc;
    if (isVenuePosition(entry.house)) out.house = entry.house;
    return out.sol || out.usdc || out.house ? out : null;
  } catch {
    return null;
  }
}

// Bundle Address Lookup Table — collapses the ~28 static program/PDA/mint/pool
// addresses to 1-byte indices so the swap-heavy add_liq legs fit under 1232
// bytes. Cached client-side (the table is immutable for our purposes).
let bundleLutCache: { at: number; accts: AddressLookupTableAccount[] } | null = null;
export async function loadBundleLut(
  connection: Connection
): Promise<AddressLookupTableAccount[]> {
  const addr = process.env.NEXT_PUBLIC_BUNDLE_LUT?.trim();
  if (!addr) return [];
  const now = Date.now();
  if (bundleLutCache && now - bundleLutCache.at < 600_000) return bundleLutCache.accts;
  try {
    const res = await connection.getAddressLookupTable(new PublicKey(addr));
    const accts = res.value ? [res.value] : [];
    bundleLutCache = { at: now, accts };
    return accts;
  } catch {
    return [];
  }
}

/** Coerce a raw per-venue object (from the live API or static JSON) into LpPositions. */
function coerceLpPositions(raw: unknown): LpPositions | null {
  if (!raw || typeof raw !== "object") return null;
  if (isVenuePosition(raw)) return { sol: raw }; // old flat shape
  const e = raw as LpPositions;
  const out: LpPositions = {};
  if (isVenuePosition(e.sol)) out.sol = e.sol;
  if (isVenuePosition(e.usdc)) out.usdc = e.usdc;
  if (isVenuePosition(e.house)) out.house = e.house;
  return out.sol || out.usdc || out.house ? out : null;
}

// Client-side memo of the live registry so we don't refetch on every trade.
let liveRegistryCache: { at: number; data: Record<string, unknown> } | null = null;

/**
 * LIVE LP positions for a mint, derived on-chain via /api/lp-registry (cached
 * server-side 60s + client-side 30s). Falls back to the static lpPositions.json
 * (back-compat) if the API is unavailable. This is what lets newly-opened
 * positions appear automatically — no JSON edit / commit / redeploy.
 */
export async function fetchLpPositions(mint: string): Promise<LpPositions | null> {
  try {
    const now = Date.now();
    if (!liveRegistryCache || now - liveRegistryCache.at > 30_000) {
      const res = await fetch("/api/lp-registry");
      if (res.ok) {
        const j = await res.json();
        if (!j.error && j.registry) liveRegistryCache = { at: now, data: j.registry };
      }
    }
    // LIVE, on-chain-derived registry only — no static lpPositions.json fallback.
    return coerceLpPositions(liveRegistryCache?.data?.[mint]);
  } catch {
    return null;
  }
}

/** The venues (0=SOL,1=USDC,2=HOUSE) that have a usable position in `positions`. */
export function availableVenues(positions: LpPositions): Venue[] {
  const out: Venue[] = [];
  // SOL = a pure single-sided WSOL deposit (no swap). The USDC + HOUSE venues
  // first SWAP/BUY (USDC: WSOL->USDC on Orca; HOUSE: WSOL->HOUSE on PumpSwap)
  // before depositing — and the Orca swap currently reverts the whole bundle
  // with InvalidTickArraySequence (0x1787) from a malformed swap tick-array
  // sequence. Gate those OFF by default so add_liq NEVER breaks a buy; flip
  // NEXT_PUBLIC_ADD_LIQ_SWAP_VENUES=true once the swap tick arrays are fixed.
  if (isVenuePosition(positions.sol)) out.push(0);
  if (process.env.NEXT_PUBLIC_ADD_LIQ_SWAP_VENUES === "true") {
    if (isVenuePosition(positions.usdc)) out.push(1);
    if (isVenuePosition(positions.house)) out.push(2);
  }
  return out;
}

type Meta = { pubkey: PublicKey; isSigner: boolean; isWritable: boolean };
const pk = (v: string | PublicKey) => (typeof v === "string" ? new PublicKey(v) : v);
const meta = (v: string | PublicKey, isWritable: boolean, isSigner = false): Meta => ({
  pubkey: pk(v), isSigner, isWritable,
});

const i32le = (n: number) => { const b = Buffer.alloc(4); b.writeInt32LE(n, 0); return b; };
const u128le = (n: BN) => n.toArrayLike(Buffer, "le", 16);
const u64le = (n: BN) => n.toArrayLike(Buffer, "le", 8);

/**
 * The 14 Orca `increase_liquidity_by_token_amounts_v2` deposit accounts for a
 * venue's pre-opened position, in the exact order the program forwards them:
 *   whirlpool(W), token_program_a, token_program_b, memo, position(W),
 *   position_token_account, token_mint_a, token_mint_b, token_owner_account_a(W),
 *   token_owner_account_b(W), token_vault_a(W), token_vault_b(W),
 *   tick_array_lower(W), tick_array_upper(W).
 * (The trailing `orca_program` account is appended once by the caller.)
 */
function depositAccounts(p: VenuePosition): Meta[] {
  return [
    meta(p.whirlpool, true), meta(p.tokenProgramA, false), meta(p.tokenProgramB, false),
    meta(MEMO_PROGRAM, false), meta(p.position, true), meta(p.positionTokenAccount, false),
    meta(p.tokenMintA, false), meta(p.tokenMintB, false),
    meta(p.tokenOwnerAccountA, true), meta(p.tokenOwnerAccountB, true),
    meta(p.tokenVaultA, true), meta(p.tokenVaultB, true),
    meta(p.tickArrayLower, true), meta(p.tickArrayUpper, true),
  ];
}

const tickArrayStart = (tick: number, tickSpacing: number) => {
  const span = tickSpacing * 88;
  return Math.floor(tick / span) * span;
};
const deriveTickArrayPda = (whirlpool: PublicKey, startIndex: number) =>
  findPda(
    [Buffer.from("tick_array"), whirlpool.toBuffer(), Buffer.from(String(startIndex))],
    ORCA_PROGRAM
  );

/**
 * Derive the 14 Orca `swap_v2` accounts (USDC venue) that swap the escrow WSOL
 * into USDC on `USDC_SWAP_POOL`, in the exact order the program reads them:
 *   [0] token_program_a [1] token_program_b [2] memo [3] whirlpool(W)
 *   [4] token_mint_a [5] token_mint_b
 *   [6] token_owner_account_a(W) [7] token_vault_a(W)
 *   [8] token_owner_account_b(W) [9] token_vault_b(W)
 *   [10] tick_array_0(W) [11] tick_array_1(W) [12] tick_array_2(W) [13] oracle(W)
 * The pool's live state is read on-chain to learn the (A,B) mint ordering, the
 * vaults, and the current tick (for the 3 swap tick arrays). The swap direction
 * is WSOL->USDC, so `a_to_b` = (WSOL is token A) and the tick arrays walk down
 * (a_to_b) / up (b_to_a) from the current array.
 */
async function deriveUsdcSwapAccounts(
  connection: Connection,
  lpOwnerWsolAta: PublicKey,
  lpOwnerUsdcAta: PublicKey
): Promise<Meta[]> {
  const info = await connection.getAccountInfo(USDC_SWAP_POOL);
  if (!info) throw new Error(`USDC swap pool ${USDC_SWAP_POOL.toBase58()} not found`);
  const d = Buffer.from(info.data);
  const tickSpacing = d.readUInt16LE(41);
  const tickCurrent = d.readInt32LE(81);
  const mintA = new PublicKey(d.subarray(101, 133));
  const vaultA = new PublicKey(d.subarray(133, 165));
  const mintB = new PublicKey(d.subarray(181, 213));
  const vaultB = new PublicKey(d.subarray(213, 245));

  const wsolIsA = mintA.equals(WSOL_MINT);
  // lp_owner token accounts for the swap pool's A/B sides (WSOL + USDC, both
  // classic SPL Token). The WSOL side must be lp_owner's WSOL ATA and the USDC
  // side lp_owner's USDC ATA (== the deposit's USDC source) — the program checks.
  const ownerA = wsolIsA ? lpOwnerWsolAta : lpOwnerUsdcAta;
  const ownerB = wsolIsA ? lpOwnerUsdcAta : lpOwnerWsolAta;

  // 3 swap tick arrays, current first, walking in the swap direction.
  const span = tickSpacing * 88;
  const start0 = tickArrayStart(tickCurrent, tickSpacing);
  const dir = wsolIsA ? -1 : 1; // a_to_b (price down) walks to LOWER arrays
  const ta0 = deriveTickArrayPda(USDC_SWAP_POOL, start0);
  const ta1 = deriveTickArrayPda(USDC_SWAP_POOL, start0 + dir * span);
  const ta2 = deriveTickArrayPda(USDC_SWAP_POOL, start0 + dir * 2 * span);
  const oracle = findPda([Buffer.from("oracle"), USDC_SWAP_POOL.toBuffer()], ORCA_PROGRAM);

  return [
    meta(TOKEN_PROGRAM_ID, false), meta(TOKEN_PROGRAM_ID, false), meta(MEMO_PROGRAM, false),
    meta(USDC_SWAP_POOL, true), meta(mintA, false), meta(mintB, false),
    meta(ownerA, true), meta(vaultA, true),
    meta(ownerB, true), meta(vaultB, true),
    meta(ta0, true), meta(ta1, true), meta(ta2, true), meta(oracle, true),
  ];
}

/**
 * Build the `add_liq` instruction for ONE venue, consuming the escrowed LP third.
 *
 * AddLiq struct accounts (constant, always first):
 *   [0]bundle_guard(W) [1]payer(W,S) [2]lp_owner [3]wsol_mint
 *   [4]wsol_token_program [5]system_program [6]instructions_sysvar
 * then the per-venue remaining accounts:
 *   venue 0 (SOL)   15: depositAccounts(sol) + orca_program
 *   venue 1 (USDC)  29: swapAccounts(SOL/USDC) + depositAccounts(usdc) + orca_program
 *   venue 2 (HOUSE) 38: pumpSwapBuy(23) + depositAccounts(house) + orca_program
 * Trailing data arg = `venue: u8`.
 *
 * Only venue 0 uses the liquidity/token_max args (single-sided WSOL, range placed
 * on the WSOL side). For venues 1/2 the program computes the deposit from the
 * post-swap/post-buy balance, so those args are passed as 0.
 */
export async function buildAddLiqIx(
  connection: Connection,
  walletPubkey: PublicKey,
  positions: LpPositions,
  venue: Venue,
  lpLamports: number | BN
): Promise<TransactionInstruction> {
  const pos = positions[VENUE_KEY[venue]];
  if (!isVenuePosition(pos)) {
    throw new Error(`add_liq: no registry position for venue ${venue}`);
  }
  const bundleGuard = findPda([Buffer.from("bundle_guard")], PUMP_PROGRAM);
  const lpOwner = findPda([Buffer.from("lp_owner")], PUMP_PROGRAM);
  const spend = new BN(lpLamports.toString());

  const structKeys: Meta[] = [
    meta(bundleGuard, true), meta(walletPubkey, true, true), meta(lpOwner, false),
    meta(WSOL_MINT, false), meta(TOKEN_PROGRAM_ID, false), meta(SystemProgram.programId, false),
    meta(SYSVAR_INSTRUCTIONS_PUBKEY, false),
  ];

  // --- args: only venue 0 uses liquidity/token_max (single-sided WSOL) ---
  let liquidity = new BN(0);
  let tokenMaxA = new BN(0);
  let tokenMaxB = new BN(0);
  // Safety (ALL venues): every venue deposits SINGLE-SIDED in its quote token
  // (0=WSOL, 1=USDC, 2=HOUSE) into `pos.whirlpool`. That only yields liquidity
  // when the live price sits on the quote side of the position's range; if the
  // pool has drifted into/through the range the Orca CPI reverts LiquidityZero,
  // which (in the atomic bundle) breaks the buy. Read the deposit pool's live
  // tick and skip the leg (caller falls back to the 3-leg bundle) when invalid.
  {
    const quoteMint = [WSOL_MINT, USDC_MINT, HOUSE_MINT][venue];
    const wInfo = await connection.getAccountInfo(pk(pos.whirlpool));
    if (!wInfo) throw new Error(`add_liq(v${venue}): whirlpool not found; skipping`);
    const tickCurrent = wInfo.data.readInt32LE(81);
    const quoteIsA = pos.tokenMintA === quoteMint.toBase58();
    const valid = quoteIsA
      ? tickCurrent < pos.tickLowerIndex
      : tickCurrent >= pos.tickUpperIndex;
    if (!valid) {
      throw new Error(
        `add_liq(v${venue}): price in/through range (tick ${tickCurrent}, range [${pos.tickLowerIndex},${pos.tickUpperIndex}]) — single-sided deposit would yield 0 liquidity; skipping`
      );
    }
  }

  if (venue === 0) {
    // sqrt price (NOT Q64) at a tick = 1.0001^(tick/2).
    const sqrtAt = (tick: number) => Math.pow(1.0001, tick / 2);
    const sL = sqrtAt(pos.tickLowerIndex);
    const sU = sqrtAt(pos.tickUpperIndex);
    const wsolIsA = pos.tokenMintA === WSOL_MINT.toBase58();
    // Target ~80% of the escrow so rounding never pushes cost above the cap.
    const amtF = Number(spend.muln(80).divn(100).toString());
    // Single-sided liquidity from the WSOL-side amount.
    //  - WSOL is token A (price below range): L = amountA * (sL*sU)/(sU-sL)
    //  - WSOL is token B (price above range): L = amountB / (sU-sL)
    const L = wsolIsA ? amtF * ((sL * sU) / (sU - sL)) : amtF / (sU - sL);
    liquidity = new BN(Math.max(1, Math.floor(L)));
    // token_max: full escrow on the WSOL side (program clamps to escrow), 0 on the
    // meme side (we ape only SOL).
    tokenMaxA = wsolIsA ? spend : new BN(0);
    tokenMaxB = wsolIsA ? new BN(0) : spend;
  }
  const data = Buffer.concat([
    DISC_ADD_LIQ,
    i32le(pos.tickLowerIndex), i32le(pos.tickUpperIndex),
    u128le(liquidity), u64le(tokenMaxA), u64le(tokenMaxB),
    Buffer.from([venue]),
  ]);

  // --- per-venue remaining accounts ---
  let remaining: Meta[];
  if (venue === 0) {
    // SOL/meme single-sided WSOL deposit (15).
    remaining = [...depositAccounts(pos), meta(ORCA_PROGRAM, false)];
  } else if (venue === 1) {
    // SOL/USDC swap (14) + USDC/meme deposit (14) + orca (29).
    const lpOwnerWsolAta = getAssociatedTokenAddressSync(
      WSOL_MINT, lpOwner, true, TOKEN_PROGRAM_ID
    );
    const lpOwnerUsdcAta = getAssociatedTokenAddressSync(
      USDC_MINT, lpOwner, true, TOKEN_PROGRAM_ID
    );
    const swap = await deriveUsdcSwapAccounts(connection, lpOwnerWsolAta, lpOwnerUsdcAta);
    remaining = [...swap, ...depositAccounts(pos), meta(ORCA_PROGRAM, false)];
  } else {
    // PumpSwap buy_exact_quote_in (23, identical to bundle_buy_burn) + HOUSE/meme
    // deposit (14) + orca (38). The SDK derives the canonical buy accounts; the
    // first 23 are exactly what the program's `buy_exact_quote_in` CPI consumes,
    // and [1] (treasury "user") is forced non-signer (the program signs for it).
    // quoteIn only feeds the SDK's quote math (accounts are pool-fixed); floor it
    // so a tiny LP third can never make buyQuoteInput throw.
    const sdkQuote = BN.max(spend, new BN(1_000_000));
    const { buyIx } = await deriveHouseBuyIx(connection, sdkQuote);
    const pumpKeys: Meta[] = buyIx.keys.slice(0, 23).map((k, i) => ({
      pubkey: k.pubkey,
      isSigner: i === 1 ? false : k.isSigner,
      isWritable: k.isWritable,
    }));
    remaining = [...pumpKeys, ...depositAccounts(pos), meta(ORCA_PROGRAM, false)];
  }

  return new TransactionInstruction({
    programId: PUMP_PROGRAM,
    keys: [...structKeys, ...remaining],
    data,
  });
}
