"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AvatarImage, AvatarFallback, Avatar } from "@/components/ui/avatar";
import { Progress } from "./ui/progress";
import { useBondingCurve } from "@/hooks/useBondingCurve";
import { Coin } from "@/hooks/useCoins";
import { lamportsToSol } from "@/utils/lamportsToSol";
import { BN } from "@coral-xyz/anchor";
import { usePumpProgram } from "@/hooks/usePumpProgram";
import { useGlobal } from "@/hooks/useGlobal";
import {
  ACCOUNT_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptAccount,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { utils } from "@coral-xyz/anchor";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import Info from "./Info";
import clsx from "clsx";
import { useToast } from "./ui/use-toast";
import { ToastAction } from "./ui/toast";
import { CommentInput } from "./CommentInput";
import { Comments } from "./Comments";
import { useSlippage } from "@/hooks/useSlippage";
import { Slippage } from "./Slippage";
import { usePriorityFee } from "@/providers/PriorityFeeProvider";
import { Thread } from "./Thread";
import {
  sendTransaction,
  sendJitoBundle,
  sendBundleSerial,
  getJitoTipLamports,
} from "@/utils/sendTransaction";
import { useSolBalance } from "@/hooks/useSolBalance";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import {
  HOUSE_MINT,
  ORCA_PROGRAM_ID,
  deriveOrcaPools,
  deriveReferralRecord,
  getReferralChainOnchain,
} from "@/constants/venues";
import {
  buildBundleBuyBurnIx,
  buildCommitIx,
  fetchLpPositions,
  buildAddLiqIx,
  availableVenues,
  type Venue,
} from "@/lib/buyBurn";
import { humanizeWalletError, bundleWalletBlockReason } from "@/lib/walletError";

// Venue order for the optional add_liq leg. A single localStorage counter makes
// consecutive trades START the rotation at SOL(0)->USDC(1)->HOUSE(2) among ONLY
// the venues that actually have a live on-chain position for the coin. The caller
// then tries them IN THIS ORDER and uses the first whose single-sided deposit is
// currently valid — so a guard-skipped venue doesn't kill the whole leg. SSR-safe.
const ADD_LIQ_ROTATION_KEY = "addLiqVenueRotation";
function addLiqVenueOrder(venues: Venue[]): Venue[] {
  if (venues.length <= 1) return venues;
  let counter = 0;
  try {
    if (typeof window !== "undefined") {
      counter =
        parseInt(window.localStorage.getItem(ADD_LIQ_ROTATION_KEY) || "0", 10) || 0;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        ADD_LIQ_ROTATION_KEY,
        String((counter + 1) % 1_000_000)
      );
    }
  } catch {
    /* ignore */
  }
  // rotation-ordered: start at `counter`, then wrap through the rest
  return venues.map((_, i) => venues[(counter + i) % venues.length]);
}

interface TradeProps {
  title: string;
  holders?: any[];
  progress?: number;
  logo?: string;
  description?: string;
  coin: Coin;
  showInput?: boolean;
}

export default function TradeBox({
  title,
  holders,
  logo,
  description,
  coin,
  showInput,
}: TradeProps) {
  const [isBuySelected, setIsBuySelected] = useState(true);
  const [amount, setAmount] = useState<number>();
  const [solAmount, setSolAmount] = useState<number>();
  const { global, globalPDA } = useGlobal();
  const { slippage } = useSlippage();
  const {
    bondingCurve,
    loading: bondingCurveLoading,
    buyQuote,
    sellQuote,
  } = useBondingCurve(coin);
  const { pumpProgram } = usePumpProgram();
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const { signTransaction, signAllTransactions, publicKey, wallet: connectedWallet } = useWallet();
  const { solBalance } = useSolBalance(publicKey?.toBase58());
  const { tokenBalance, rawTokenBalance } = useTokenBalance(
    coin.mint,
    publicKey?.toBase58()
  );
  const { toastTransaction } = useToast();
  const [isResetting, setIsResetting] = useState(false);
  const [nativeSelected, setNativeSelected] = useState(true);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const { priorityFee, tipAccount } = usePriorityFee();

  const parsedAmount = nativeSelected
    ? new BN(Math.floor((solAmount || 0) * 10 ** 9))
    : new BN(Math.floor(amount || 0).toString()).mul(new BN("1000000"));

  const createComment = async (comment: string, signature: string) => {
    await fetch(process.env.NEXT_PUBLIC_API_URL + "/comments", {
      method: "POST",
      body: JSON.stringify({ comment, signature }),
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  const setAmountFromPercentage = async (percentage: number) => {
    if (!rawTokenBalance) return;

    const amount = rawTokenBalance.mul(new BN(percentage)).div(new BN(100));
    const amountInTokens = amount.toNumber() / 10 ** 6;
    setAmount(amountInTokens);

    const quote = sellQuote(amount);
    const solAmountInSol = lamportsToSol(quote);
    setSolAmount(solAmountInSol);
  };

  const openCommentModal = async () => {
    if (!wallet) {
      toastTransaction({
        title: "wallet not connected",
        description: "please connect your wallet to place a trade.",
        status: "error",
      });
      return;
    }

    if (!amount || amount <= 0) {
      toastTransaction({
        title: "invalid amount",
        description: "please enter a valid amount to trade.",
        status: "error",
      });
      return;
    }

    setShowCommentModal(true);
  };

  const buy = async (comment?: string) => {
    try {
      if (!amount) return;
      if (!bondingCurve) return;
      if (!pumpProgram) return;
      if (!global) return;
      if (!globalPDA) return;
      if (!wallet) return;
      if (!signTransaction) return;
      if (!publicKey) return;

      let tokensToBuy = new BN(0);
      let solRequired = new BN(0);

      if (nativeSelected) {
        tokensToBuy = buyQuote(parsedAmount, true);
        solRequired = parsedAmount;

        if (!global) return;
        const fee = solRequired.mul(global.feeBasisPoints).div(new BN(10_000));
        solRequired = solRequired.add(fee);
      } else {
        solRequired = buyQuote(parsedAmount, false);
        tokensToBuy = parsedAmount;
      }

      const eventAuthorityPDA = PublicKey.findProgramAddressSync(
        [utils.bytes.utf8.encode("__event_authority")],
        pumpProgram.programId
      )[0];

      // Slot-scoped bundle guard singleton (PDA [b"bundle_guard"]). The new
      // deployed `buy` requires this as a trailing account; it marks the guard,
      // escrows the burn third, and WITHHOLDS the buyer's tokens until `commit`.
      const bundleGuardPDA = PublicKey.findProgramAddressSync(
        [utils.bytes.utf8.encode("bundle_guard")],
        pumpProgram.programId
      )[0];

      const associatedUser = getAssociatedTokenAddressSync(
        new PublicKey(coin.mint),
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const associatedBondingCurve = getAssociatedTokenAddressSync(
        new PublicKey(coin.mint),
        new PublicKey(coin.bonding_curve),
        true,
        TOKEN_2022_PROGRAM_ID
      );

      const userTokenAccount = await getAccount(
        connection,
        associatedUser
      ).catch((e) => null);

      // Per-trade bundle: referral chain + house buy&burn ATA + orca pools.
      const referralRecord = deriveReferralRecord(
        wallet.publicKey,
        pumpProgram.programId
      );
      // Resolve the TRUE 3-deep chain: tier-1 from the ref link/localStorage,
      // tiers 2/3 read from the direct referrer's on-chain referral_record so
      // they actually pay out (not just the direct referrer).
      const { referrer, referrer2, referrer3 } = await getReferralChainOnchain(
        connection,
        wallet.publicKey,
        pumpProgram.programId
      );
      const userHouseAta = getAssociatedTokenAddressSync(
        HOUSE_MINT,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const {
        orcaSolNewmeme,
        orcaUsdcNewmeme,
        orcaHouseNewmeme,
      } = deriveOrcaPools(new PublicKey(coin.mint));

      // buyInstruction is built LATER (after the slow buildBundleBuyBurnIx) using a
      // fresh buyQuote() call. This keeps the slippage max/min as close as possible
      // to the state the wallet simulator (and on-chain) will see, avoiding
      // "slippage tolerance exceeded" / "Failed to simulate" errors.

      const tipLamports = await getJitoTipLamports();
      console.log("jito tip for bundle", (tipLamports / 1e9).toFixed(6), "SOL");
      const instructions: TransactionInstruction[] = [
        tipAccount
          ? SystemProgram.transfer({
              fromPubkey: wallet.publicKey,
              toPubkey: new PublicKey(tipAccount),
              lamports: tipLamports,
            })
          : null,
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee,
        }),
        // CU limit: the buy now also runs the introspection allowlist scan
        // (loads every tx instruction) + escrow/referral, which exceeds the
        // default 200k -> ProgramFailedToComplete. 400k gives ample headroom.
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        userTokenAccount
          ? null
          : createAssociatedTokenAccountIdempotentInstruction(
              wallet.publicKey,
              associatedUser,
              wallet.publicKey,
              new PublicKey(coin.mint),
              TOKEN_2022_PROGRAM_ID
            ),
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userHouseAta,
          wallet.publicKey,
          HOUSE_MINT,
          TOKEN_2022_PROGRAM_ID
        ),
      ].filter((v) => v !== null) as TransactionInstruction[];

      // --- Atomic same-slot bundle: buy -> bundle_buy_burn -> commit ---
      // The deployed program REQUIRES the full mask (TRADE|REFERRAL|BURN) before
      // `commit` will release the buyer's tokens. The new `buy` only WITHHOLDS
      // them (it marks STEP_TRADE/STEP_REFERRAL + escrows the burn third), so we
      // MUST also run the buy&burn (STEP_BURN) and commit legs in the SAME tx.
      //
      // CRITICAL: these legs are NOT optional. If we cannot assemble them we
      // FAIL the whole buy rather than send a partial `buy` that would strand
      // the buyer's tokens — so this is intentionally NOT wrapped in a
      // try/catch that swallows the error. Any failure bubbles up to the outer
      // catch and we never sign/send a buy without its commit.
      const solCostBasis = nativeSelected ? parsedAmount : solRequired;
      const tradeFee = solCostBasis
        .mul(global.feeBasisPoints)
        .div(new BN(10_000));
      let burnLamports = tradeFee.div(new BN(3));

      // Dust/floor case: the burn third can round down below pump-AMM's minimum.
      // We can NO LONGER skip the burn leg (the program's REQUIRED_MASK includes
      // BURN, so `commit` would fail without bundle_buy_burn having run). Instead,
      // bump the burn third up to a small floor so the bundle still completes.
      const BURN_FLOOR = new BN(5000);
      if (burnLamports.lt(BURN_FLOOR)) {
        burnLamports = BURN_FLOOR;
      }

      const { setupIxs, buyBurnIx } = await buildBundleBuyBurnIx(
        connection,
        wallet.publicKey,
        burnLamports
      );

      const commitIx = buildCommitIx(
        wallet.publicKey,
        new PublicKey(coin.mint),
        new PublicKey(coin.bonding_curve),
        associatedBondingCurve,
        associatedUser
      );

      // --- Build the main buy instruction as LATE as possible ---
      // Recompute tokens + max cost using buyQuote() at this moment (after the
      // potentially slow buildBundleBuyBurnIx + Orca state fetches). The hook's
      // bondingCurve is kept fresh by onAccountChange subscription. This makes
      // the slippage limit match what the simulator sees, fixing "slippage exceeded"
      // + "Failed to simulate" errors in the wallet preview.
      const freshTokensToBuy = nativeSelected
        ? buyQuote(parsedAmount, true)
        : parsedAmount;
      let freshMaxSol: BN;
      if (nativeSelected) {
        let base = parsedAmount;
        if (global) {
          const fee = base.mul(global.feeBasisPoints).div(new BN(10_000));
          base = base.add(fee);
        }
        freshMaxSol = base.add(
          base.mul(new BN(Math.floor(slippage * 10))).div(new BN(1000))
        );
      } else {
        const base = buyQuote(parsedAmount, false);
        freshMaxSol = base.add(
          base.mul(new BN(Math.floor(slippage * 10))).div(new BN(1000))
        );
      }
      const buyInstruction = await pumpProgram.methods
        .buy(freshTokensToBuy, freshMaxSol)
        .accounts({
          feeRecipient: global.feeRecipient,
          global: globalPDA,
          mint: coin.mint,
          bondingCurve: coin.bonding_curve,
          associatedBondingCurve,
          associatedUser,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          referrer,
          referrer2,
          referrer3,
          referralRecord,
          houseMint: HOUSE_MINT,
          userHouseAta,
          houseTokenProgram: TOKEN_2022_PROGRAM_ID,
          orcaSolNewmeme,
          orcaUsdcNewmeme,
          orcaHouseNewmeme,
          orcaProgram: ORCA_PROGRAM_ID,
          bundleGuard: bundleGuardPDA,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          ['event_authority']: eventAuthorityPDA,
          program: pumpProgram.programId,
        })
        .instruction();

      // The full playbook (buy -> bundle_buy_burn -> commit) is far too many
      // accounts to fit in ONE transaction (encoding overruns the 1232-byte
      // limit), so we ship it as an ATOMIC JITO BUNDLE of separate txs that all
      // land in the same slot (room to grow the playbook to 5). The on-chain
      // BundleGuard counter enforces the full required mask landed this slot;
      // Jito guarantees same-slot + ordering. This is what makes trades
      // un-sandwichable: a bot must replicate the exact playbook or it won't fly.
      const walletBlock = bundleWalletBlockReason(
        connectedWallet?.adapter?.name,
        !!signAllTransactions
      );
      if (walletBlock) {
        throw new Error(walletBlock);
      }

      // Fetch the blockhash *immediately* before building+signing so that the
      // signed bundle txs carry a very fresh blockhash when they reach Jito.
      // (Wallet preview + user confirmation time would otherwise age the hash.)
      const recentBlockhash = await connection
        .getLatestBlockhash("confirmed")
        .then((v) => v.blockhash);

      const cuPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee,
      });
      // Each bundle leg runs the introspection scan; add_liq also does a CU-heavy
      // Orca increase_liquidity. 400k covers all of them (default 200k is too low).
      const cuLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000,
      });
      const buildTx = (ixs: TransactionInstruction[]) =>
        new VersionedTransaction(
          new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash,
            instructions: ixs,
          }).compileToV0Message()
        );

      // tx1: setup + buy (the tip lives here so the bundle is incentivized).
      const txBuy = buildTx([...instructions, ...setupIxs, buyInstruction]);
      // tx2 (optional, flag-gated): add_liq — single-sided deposit of the escrowed
      // LP third into a program-owned Orca position on ONE rotating venue
      // (SOL->USDC->HOUSE round-robin among venues with a registry position).
      // Gated by NEXT_PUBLIC_ENABLE_ADD_LIQ + registry; building it can NEVER
      // break the buy: any error falls back to the 3-leg bundle. When active the
      // bundle is buy -> add_liq(venue) -> burn -> commit.
      let txAddLiq: VersionedTransaction | null = null;
      if (process.env.NEXT_PUBLIC_ENABLE_ADD_LIQ === "true") {
        // Try EVERY venue that has a live on-chain position, in rotation order,
        // and use the FIRST whose single-sided deposit is currently valid (the
        // others get guard-skipped when price has moved through their range).
        // Building this can NEVER break the buy — any failure leaves the 3-leg
        // bundle. (5-tx Jito cap = one venue per trade; rotation fills all 3.)
        const positions = await fetchLpPositions(coin.mint);
        const order = positions ? addLiqVenueOrder(availableVenues(positions)) : [];
        for (const venue of order) {
          try {
            const addLiqIx = await buildAddLiqIx(
              connection,
              wallet.publicKey,
              positions!,
              venue,
              burnLamports
            );
            // venue 2 (HOUSE) does a PumpSwap buy + Orca deposit -> CU-heavy; 600k.
            const addLiqCuLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
              units: venue === 2 ? 600_000 : 400_000,
            });
            txAddLiq = buildTx([cuPriceIx, addLiqCuLimitIx, addLiqIx]);
            break;
          } catch (e) {
            console.warn(`add_liq venue ${venue} skipped:`, (e as Error).message);
          }
        }
      }
      // tx3: buy & burn $HOUSE leg.
      const txBuyBurn = buildTx([cuPriceIx, cuLimitIx, buyBurnIx]);
      // tx4: commit — releases the withheld tokens; MUST be last.
      const txCommit = buildTx([cuPriceIx, cuLimitIx, commitIx]);

      // Jito bundle: same-slot AND IN-ORDER. Order: buy -> [add_liq] -> burn -> commit.
      const bundleTxs = (txAddLiq
        ? [txBuy, txAddLiq, txBuyBurn, txCommit]
        : [txBuy, txBuyBurn, txCommit]) as VersionedTransaction[];
      const signedTxs = await signAllTransactions!(bundleTxs);
      const signature = await sendJitoBundle(signedTxs, connection);

      if (comment) createComment(comment, signature);

      setAmount(("" as any) as number);

      await toastTransaction({
        title: `buy ${amount} ${coin.symbol} for ${lamportsToSol(
          solRequired
        )} SOL`,
        signature,
      });
    } catch (e) {
      console.error("could not submit buy", e);

      await toastTransaction({
        title: "Could not submit buy",
        description: humanizeWalletError(e),
        status: "error",
      });
    }
  };

  const sell = async (comment?: string) => {
    try {
      if (!amount) return;
      if (!bondingCurve) return;
      if (!pumpProgram) return;
      if (!global) return;
      if (!globalPDA) return;
      if (!wallet) return;
      if (!signTransaction) return;
      if (!publicKey) return;

      const eventAuthorityPDA = PublicKey.findProgramAddressSync(
        [utils.bytes.utf8.encode("__event_authority")],
        pumpProgram.programId
      )[0];

      const bundleGuardPDA = PublicKey.findProgramAddressSync(
        [utils.bytes.utf8.encode("bundle_guard")],
        pumpProgram.programId
      )[0];

      const associatedUser = getAssociatedTokenAddressSync(
        new PublicKey(coin.mint),
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const associatedBondingCurve = getAssociatedTokenAddressSync(
        new PublicKey(coin.mint),
        new PublicKey(coin.bonding_curve),
        true,
        TOKEN_2022_PROGRAM_ID
      );

      const amountToSell = parsedAmount;
      const quote = sellQuote(amountToSell);

      // Per-trade bundle: referral chain + house buy&burn ATA + orca pools.
      const referralRecord = deriveReferralRecord(
        wallet.publicKey,
        pumpProgram.programId
      );
      // Resolve the TRUE 3-deep chain: tier-1 from the ref link/localStorage,
      // tiers 2/3 read from the direct referrer's on-chain referral_record so
      // they actually pay out (not just the direct referrer).
      const { referrer, referrer2, referrer3 } = await getReferralChainOnchain(
        connection,
        wallet.publicKey,
        pumpProgram.programId
      );
      const userHouseAta = getAssociatedTokenAddressSync(
        HOUSE_MINT,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const {
        orcaSolNewmeme,
        orcaUsdcNewmeme,
        orcaHouseNewmeme,
      } = deriveOrcaPools(new PublicKey(coin.mint));

      // sellInstruction + its wrapping instructions[] are built later (after the
      // slow buildBundleBuyBurnIx) using a fresh sellQuote() call.

      // --- Atomic same-slot Jito bundle: sell -> bundle_buy_burn -> commit ---
      // The deployed `sell` now withholds the seller's SOL payout + escrows the
      // burn third, marks STEP_TRADE/STEP_REFERRAL, and `commit` releases the
      // withheld SOL once the full mask (TRADE|REFERRAL|BURN) lands this slot.
      // Too many accounts for one tx, so we ship a Jito bundle (same-slot,
      // atomic). buy&burn is REQUIRED (commit fails without STEP_BURN), so we do
      // NOT swallow its errors — a failure fails the whole sell.
      const tradeFee = quote.mul(global.feeBasisPoints).div(new BN(10_000));
      let burnLamports = tradeFee.div(new BN(3));
      const BURN_FLOOR = new BN(5000);
      if (burnLamports.lt(BURN_FLOOR)) burnLamports = BURN_FLOOR;

      const { setupIxs, buyBurnIx } = await buildBundleBuyBurnIx(
        connection,
        wallet.publicKey,
        burnLamports
      );
      const commitIx = buildCommitIx(
        wallet.publicKey,
        new PublicKey(coin.mint),
        new PublicKey(coin.bonding_curve),
        associatedBondingCurve,
        associatedUser
      );

      // Build sellInstruction + the instructions list for txSell *late* (after slow
      // buildBundle...) so we use the freshest sellQuote(). Fixes wallet sim failing
      // with "slippage exceeded" / "Failed to simulate".
      const freshAmountToSell = parsedAmount;
      const freshQuote = sellQuote(freshAmountToSell);
      const freshMinSolOut = freshQuote.sub(
        freshQuote.mul(new BN(Math.floor(slippage * 10))).div(new BN(1000))
      );
      const sellInstruction = await pumpProgram.methods
        .sell(freshAmountToSell, freshMinSolOut)
        .accounts({
          feeRecipient: global.feeRecipient,
          global: globalPDA,
          mint: coin.mint,
          bondingCurve: coin.bonding_curve,
          associatedBondingCurve,
          associatedUser,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          referrer,
          referrer2,
          referrer3,
          referralRecord,
          houseMint: HOUSE_MINT,
          userHouseAta,
          houseTokenProgram: TOKEN_2022_PROGRAM_ID,
          orcaSolNewmeme,
          orcaUsdcNewmeme,
          orcaHouseNewmeme,
          orcaProgram: ORCA_PROGRAM_ID,
          bundleGuard: bundleGuardPDA,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          ['event_authority']: eventAuthorityPDA,
          program: pumpProgram.programId,
        })
        .instruction();

      const tipLamports = await getJitoTipLamports();
      console.log("jito tip for bundle", (tipLamports / 1e9).toFixed(6), "SOL");
      const instructions: TransactionInstruction[] = [
        tipAccount
          ? SystemProgram.transfer({
              fromPubkey: wallet.publicKey,
              toPubkey: new PublicKey(tipAccount),
              lamports: tipLamports,
            })
          : null,
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee,
        }),
        // CU limit: sell now runs the introspection scan + escrow/withhold; 400k
        // headroom over the default 200k to avoid ProgramFailedToComplete.
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userHouseAta,
          wallet.publicKey,
          HOUSE_MINT,
          TOKEN_2022_PROGRAM_ID
        ),
        sellInstruction,
      ].filter((v) => v !== null) as TransactionInstruction[];

      const walletBlock = bundleWalletBlockReason(
        connectedWallet?.adapter?.name,
        !!signAllTransactions
      );
      if (walletBlock) {
        throw new Error(walletBlock);
      }

      // Fresh blockhash right before signing (see buy path for rationale).
      const recentBlockhash = await connection
        .getLatestBlockhash("confirmed")
        .then((v) => v.blockhash);

      const cuPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee,
      });
      // Each bundle leg runs the introspection scan; add_liq also does a CU-heavy
      // Orca increase_liquidity. 400k covers all of them (default 200k is too low).
      const cuLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000,
      });
      const buildTx = (ixs: TransactionInstruction[]) =>
        new VersionedTransaction(
          new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash,
            instructions: ixs,
          }).compileToV0Message()
        );

      // `instructions` = [tip?, cuPrice, createHouseATA, sellInstruction]; the
      // setup ixs (guard/treasury init, normally empty) must run before `sell`.
      const preSell = instructions.slice(0, instructions.length - 1);
      const sellIx = instructions[instructions.length - 1];
      const txSell = buildTx([...preSell, ...setupIxs, sellIx]);
      // Optional add_liq leg (flag-gated + registry), mirroring buy: sells also
      // add liquidity (LP-forever applies to both directions), rotating venues
      // round-robin among those with a registry position. Consumes the LP third
      // escrowed by `sell`; any build failure falls back to the 3-leg bundle.
      let txAddLiq: VersionedTransaction | null = null;
      if (process.env.NEXT_PUBLIC_ENABLE_ADD_LIQ === "true") {
        // Try every venue with a live on-chain position, in rotation order, and
        // use the first whose single-sided deposit is currently valid. Never
        // breaks the sell — any failure leaves the 3-leg bundle.
        const positions = await fetchLpPositions(coin.mint);
        const order = positions ? addLiqVenueOrder(availableVenues(positions)) : [];
        for (const venue of order) {
          try {
            const addLiqIx = await buildAddLiqIx(
              connection,
              wallet.publicKey,
              positions!,
              venue,
              burnLamports
            );
            const addLiqCuLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
              units: venue === 2 ? 600_000 : 400_000,
            });
            txAddLiq = buildTx([cuPriceIx, addLiqCuLimitIx, addLiqIx]);
            break;
          } catch (e) {
            console.warn(`add_liq venue ${venue} skipped:`, (e as Error).message);
          }
        }
      }
      const txBuyBurn = buildTx([cuPriceIx, cuLimitIx, buyBurnIx]);
      const txCommit = buildTx([cuPriceIx, cuLimitIx, commitIx]);

      // Jito bundle: same-slot AND in-order. sell -> [add_liq] -> burn -> commit.
      const bundleTxs = (txAddLiq
        ? [txSell, txAddLiq, txBuyBurn, txCommit]
        : [txSell, txBuyBurn, txCommit]) as VersionedTransaction[];
      const signedTxs = await signAllTransactions!(bundleTxs);
      const signature = await sendJitoBundle(signedTxs, connection);

      if (comment) createComment(comment, signature);

      // send this signed tx to the backend
      setAmount(("" as any) as number);

      toastTransaction({
        title: `sell ${amount} ${coin.symbol} for ${lamportsToSol(quote)} SOL`,
        signature,
      });
    } catch (e) {
      console.error("could not submit sell", e);

      await toastTransaction({
        title: "Could not submit sell",
        description: humanizeWalletError(e),
        status: "error",
      });
    }
  };

  const handleSolInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isResetting) return;

    const newSolAmount = parseFloat(e.target.value);
    if (isNaN(newSolAmount)) {
      setSolAmount(("" as any) as number);
      setAmount(("" as any) as number);
      return;
    }
    setSolAmount(newSolAmount);
    const solAmountInLamports = new BN(Math.floor(newSolAmount * 10 ** 9));

    const tokenAmountReceived = buyQuote(solAmountInLamports, true);

    const tokenAmountNumber = tokenAmountReceived.toNumber() / 10 ** 6;
    setAmount(tokenAmountNumber);
  };

  const handleTokenInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isResetting) return;

    const newTokenAmount = parseFloat(e.target.value);
    if (isNaN(newTokenAmount)) {
      setAmount(("" as any) as number);
      setSolAmount(("" as any) as number);
      return;
    }
    setAmount(newTokenAmount);
    const tokenAmountBN = new BN(newTokenAmount * 10 ** 6);

    let solAmountRequiredLamports;
    if (isBuySelected) {
      solAmountRequiredLamports = buyQuote(tokenAmountBN, false);
    } else {
      solAmountRequiredLamports = sellQuote(tokenAmountBN);
    }

    const solAmountInSol = lamportsToSol(solAmountRequiredLamports);
    setSolAmount(solAmountInSol);
  };

  const setPresetSolAmount = (amount: number) => {
    setSolAmount(amount);
    // Convert the SOL amount to the equivalent token amount using the buy quote
    const solAmountInLamports = new BN(Math.floor(amount * 10 ** 9));
    const tokenAmountReceived = buyQuote(solAmountInLamports, true);
    const tokenAmountNumber = tokenAmountReceived.toNumber() / 10 ** 6;
    setAmount(tokenAmountNumber);
  };

  const handleTrade = async (comment?: string) => {
    if (isBuySelected) {
      await buy(comment);
    } else {
      await sell(comment);
    }
  };

  const toggleBuySell = (isBuy: boolean) => {
    setIsBuySelected(isBuy);
    setIsResetting(true);

    setAmount(("" as any) as number);
    setSolAmount(("" as any) as number);

    if (!isBuy) {
      setNativeSelected(false);
    } else {
      setNativeSelected(true);
    }

    setTimeout(() => {
      setIsResetting(false);
    }, 0);
  };

  return (
    <div className="w-[350px] grid gap-4">
      {/* {holders && (
        <div className="flex items-center mb-4">
          {holders.slice(0, 3).map((holder, index) => (
            <Avatar className={`w-4 h-4 ${index > 0 ? "-ml-2" : ""}`}>
              <AvatarImage className="w-full h-full" src={holder.image} />
              <AvatarFallback>{holder.name[0]}</AvatarFallback>
            </Avatar>
          ))}
          <p className="text-gray-400 text-xs ml-2">
            Bought by
            {holders.length > 0 ? ` ${holders[0].name}` : ""}
            {holders.length > 1 ? `, ${holders[1].name}` : ""}
            {holders.length > 2
              ? ` and ${holders.length - 2} other mutuals`
              : ""}
          </p>
        </div>
      )} */}

      {showInput && (
        <div className="bg-[#2e303a] p-4 rounded-lg border border-none text-gray-400 grid gap-4">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => toggleBuySell(true)} // Call toggleBuySell with true for buying
              className={`p-2 text-center rounded ${
                isBuySelected
                  ? "bg-green-400 text-primary"
                  : "bg-gray-800 text-grey-600"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => toggleBuySell(false)} // Call toggleBuySell with false for selling
              className={`p-2 text-center rounded ${
                !isBuySelected
                  ? "bg-red-400 text-white"
                  : "bg-gray-800 text-grey-600"
              }`}
            >
              Sell
            </button>
          </div>
          <div className="flex justify-between w-full gap-2">
            {isBuySelected ? (
              <button
                onClick={() => setNativeSelected(!nativeSelected)}
                className={`text-xs py-1 px-2 rounded ${
                  nativeSelected
                    ? "bg-primary text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                    : "bg-primary text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                }`}
              >
                switch to {nativeSelected ? coin.symbol : "SOL"}
              </button>
            ) : (
              <div />
            )}

            <Slippage />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center rounded-md relative bg-[#2e303a]">
              <Input
                className="bg-transparent text-white outline-none w-full pl-3"
                id="amount"
                placeholder="0.0"
                type="number"
                value={
                  isBuySelected ? (nativeSelected ? solAmount : amount) : amount
                }
                onChange={
                  nativeSelected ? handleSolInputChange : handleTokenInputChange
                }
              />
              <div className="flex items-center ml-2 absolute right-2">
                <span className="text-white mr-2">
                  {nativeSelected ? "SOL" : coin.symbol}
                </span>
                <img
                  className="w-8 h-8 rounded-full"
                  src={
                    nativeSelected
                      ? "https://www.liblogo.com/img-logo/so2809s56c-solana-logo-solana-crypto-logo-png-file-png-all.png"
                      : coin.image_uri
                  }
                  alt={nativeSelected ? "SOL" : coin.name}
                />
              </div>
            </div>
            {isBuySelected && nativeSelected && (
              <div className="flex mt-2 bg-[#2e303a] p-1 rounded-lg">
                <button
                  onClick={() => setPresetSolAmount(("" as any) as number)}
                  className="text-xs py-1 -ml-1 px-2 rounded bg-primary text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                >
                  reset
                </button>
                <button
                  onClick={() => setPresetSolAmount(1)}
                  className="text-xs py-1 px-2 ml-1 rounded bg-primary text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                >
                  1 SOL
                </button>
                <button
                  onClick={() => setPresetSolAmount(5)}
                  className="text-xs py-1 px-2 ml-1 rounded bg-primary text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                >
                  5 SOL
                </button>
                <button
                  onClick={() => setPresetSolAmount(10)}
                  className="text-xs py-1 px-2 ml-1 rounded bg-primary text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                >
                  10 SOL
                </button>
              </div>
            )}

            {Boolean(
              isBuySelected &&
                nativeSelected &&
                solBalance &&
                solAmount &&
                solBalance < solAmount * 10 ** 9
            ) &&
              solBalance && (
                <div className="text-red-400 text-sm">
                  Insufficient balance: You have {solBalance / 10 ** 9} SOL
                </div>
              )}

            {Boolean(
              !isBuySelected &&
                rawTokenBalance &&
                amount &&
                rawTokenBalance.lt(new BN(amount).mul(new BN(10 ** 6)))
            ) &&
              solBalance && (
                <div className="text-red-400 text-sm mt-1">
                  Insufficient balance: You have {tokenBalance} {coin.symbol}
                </div>
              )}

            {!isBuySelected && (
              <div className="flex mt-2 bg-[#2e303a] p-1 rounded-lg">
                <button
                  onClick={() => setAmountFromPercentage(0)}
                  className="text-xs py-1 -ml-1 px-2 rounded bg-primary text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                >
                  reset
                </button>
                <button
                  onClick={() => setAmountFromPercentage(25)}
                  className="text-xs py-1 px-2 ml-1 rounded bg-primary text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                >
                  25%
                </button>
                <button
                  onClick={() => setAmountFromPercentage(50)}
                  className="text-xs py-1 px-2 ml-1 rounded bg-primary text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                >
                  50%
                </button>
                <button
                  onClick={() => setAmountFromPercentage(75)}
                  className="text-xs py-1 px-2 ml-1 rounded bg-primary text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                >
                  75%
                </button>
                <button
                  onClick={() => setAmountFromPercentage(100)}
                  className="text-xs py-1 px-2 ml-1 rounded bg-primary text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                >
                  100%
                </button>
              </div>
            )}
          </div>

          {Boolean(Number(amount || solAmount || 0)) && (
            <span className="text-sm text-gray-400">
              {isBuySelected
                ? nativeSelected
                  ? `${amount || 0} ${coin.symbol}`
                  : `${solAmount || 0} SOL`
                : `${solAmount || 0} SOL`}
            </span>
          )}

          <CommentInput
            onSubmit={handleTrade}
            isOpen={showCommentModal}
            onOpenChange={(v) => setShowCommentModal(v)}
            openCommentModal={openCommentModal}
            isTrade
            text={
              isBuySelected
                ? `buy ${amount || 0} ${coin.symbol} for ${solAmount || 0} SOL`
                : `sell ${amount || 0} ${coin.symbol} for ${solAmount || 0} SOL`
            }
          >
            <Button
              onClick={openCommentModal}
              className="bg-green-400 text-primary w-full py-3 rounded-md hover:bg-green-200"
            >
              place trade
            </Button>
          </CommentInput>
        </div>
      )}

      {/* <Info coin={coin} /> */}
    </div>
  );
}
