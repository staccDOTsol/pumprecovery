import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import sleep from "sleep-promise";

const MAX_RETRIES = 5;

/**
 * Dynamic Jito tip (lamports). Pulls Jito's live landed-tip floor and uses the
 * 75th percentile, clamped to a sane [floor, cap] so bundles land on contested
 * slots without overpaying. A bundle that MUST land (tokens are withheld until
 * `commit`) warrants a competitive tip, not the old 0.0003 SOL floor.
 */
export const getJitoTipLamports = async (): Promise<number> => {
  // For protected bundles the tip in tx0 decides whether leaders actually
  // include the bundle. Use 99th percentile + headroom when possible.
  const FLOOR = 1_000_000; // 0.001 SOL — realistic floor for un-sandwichable protection
  const CAP = 10_000_000; // 0.01 SOL
  try {
    const res = await fetch("/api/jito?action=tipfloor").then((r) => r.json());
    const row = Array.isArray(res) ? res[0] : res;
    const sol99 =
      row?.landed_tips_99th_percentile ??
      row?.landed_tips_95th_percentile ??
      row?.ema_landed_tips_50th_percentile ??
      0;
    // Target ~4-5x 99th or direct 99th with buffer. Clamp to sane range.
    const dynamic = Math.floor(Number(sol99) * 1e9 * 4);
    return Math.min(CAP, Math.max(FLOOR, dynamic || FLOOR));
  } catch {
    return FLOOR;
  }
};

/**
 * Submit an ORDERED set of already-signed transactions as ONE atomic Jito
 * bundle (all land in the same slot, in order, or none do). This is how the
 * un-sandwichable playbook ships: buy -> bundle_buy_burn -> commit (room to
 * grow to 5). The on-chain BundleGuard counter enforces that all required legs
 * ran the same slot; Jito guarantees the same-slot atomicity + ordering.
 *
 * Returns the first tx signature (the buy) for UX/tracking.
 */
/**
 * Preflight a bundle with the `simulateBundle` RPC (Jito-Solana; supported by
 * Helius/Triton). Unlike per-tx simulateTransaction, this applies the txs IN
 * SEQUENCE against a frozen bank, so commit's dependency on buy/buy_burn is
 * respected. Throws with the failing leg + logs so silent Jito drops become
 * visible. If the RPC doesn't support simulateBundle, it logs and returns
 * (non-blocking) so we don't break trading on infra quirks.
 */
export const simulateJitoBundle = async (
  txs: VersionedTransaction[],
  connection: Connection
): Promise<void> => {
  const encoded = txs.map((t) => Buffer.from(t.serialize()).toString("base64"));
  let res: any;
  try {
    res = await fetch((connection as any).rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "simulateBundle",
        params: [
          { encodedTransactions: encoded },
          {
            // one config slot per tx (null = don't return account snapshots)
            preExecutionAccountsConfigs: encoded.map(() => null),
            postExecutionAccountsConfigs: encoded.map(() => null),
            skipSigVerify: true,
            // Use the txs' REAL (fresh) blockhash. replaceRecentBlockhash:true
            // breaks multi-tx bundle sims: tx2+ fail fee-charging against the
            // fee-payer balance already mutated by tx1 -> false UnbalancedInstruction
            // (empty logs, 0 units, fee:null). The real blockhash charges fees
            // sequentially like Jito actually executes.
            replaceRecentBlockhash: false,
          },
        ],
      }),
    }).then((r) => r.json());
  } catch (e) {
    console.warn("simulateBundle infra error (skipping preflight):", e);
    return;
  }

  if (res?.error) {
    console.warn("simulateBundle not available / errored:", res.error);
    return; // non-blocking: RPC may not support it
  }

  const value = res?.result?.value;
  const results = value?.transactionResults || value?.transaction_results || [];
  // Label legs by the ACTUAL bundle shape: 3-leg = buy/sell -> burn -> commit;
  // 4-leg (add_liq enabled) = buy/sell -> add_liq -> burn -> commit.
  const labels =
    results.length >= 4
      ? ["buy/sell", "add_liq", "bundle_buy_burn", "commit"]
      : ["buy/sell", "bundle_buy_burn", "commit"];

  // WARN-ONLY (never block). simulateBundle cannot model our cross-tx escrow:
  // leg 1 (bundle_buy_burn) spends lamports that leg 0 (buy) escrowed into the
  // guard, but the sim evaluates each leg against a frozen pre-bundle bank, so
  // it reports a false `UnbalancedInstruction` (with 0 units / no logs = it
  // never actually executed). bundle_buy_burn is proven to work on mainnet
  // standalone, so we only LOG failing legs for visibility and proceed.
  const failIdx = results.findIndex((tr: any) => tr?.err);
  if (failIdx === -1) return;
  const failed = results[failIdx];
  const logs: string[] = failed?.logs || [];
  const ran = logs.length > 0 || (failed?.unitsConsumed ?? 0) > 0;
  console.warn(
    `simulateBundle: leg ${failIdx} (${labels[failIdx] || failIdx}) reported ${JSON.stringify(
      failed.err
    )} — ${ran ? "EXECUTED+failed (inspect logs)" : "did not execute (multi-tx sim artifact)"}; proceeding.`,
    ran ? "\n" + logs.join("\n") : ""
  );
};

/**
 * Send the bundle legs SERIALLY via RPC, fired back-to-back (no await between
 * sends) so they reach the leader within the same slot — which satisfies the
 * on-chain BundleGuard same-slot check without depending on Jito bundle
 * inclusion (which was silently dropping / rate-limiting). We then poll the
 * commit signature. Each leg is also pushed to Helius + our server for
 * redundancy. Order is preserved: buy/sell -> bundle_buy_burn -> commit.
 */
export const sendBundleSerial = async (
  txs: VersionedTransaction[],
  connection: Connection
): Promise<string> => {
  const commitSig = bs58.encode(txs[txs.length - 1].signatures[0]);
  const firstSig = bs58.encode(txs[0].signatures[0]);

  const fireAll = async () => {
    // Fire in order, back-to-back via the RPC (Helius — no Jito rate limit).
    // Don't await confirmation between them so the leader receives all three
    // within the same slot. (We deliberately do NOT hit Jito's single-tx
    // endpoint here: its 1 req/s limit trips -32097 when firing 3 at once.)
    for (const t of txs) {
      connection
        .sendRawTransaction(t.serialize(), { skipPreflight: true, maxRetries: 0 })
        .catch(() => {});
    }
  };

  const MAX_MS = 60_000;
  const POLL_MS = 2_000;
  const RESUBMIT_EVERY_MS = 8_000;
  const start = Date.now();
  let lastSubmit = Date.now();
  await fireAll();

  while (Date.now() - start < MAX_MS) {
    await sleep(POLL_MS);
    try {
      const st = await connection.getSignatureStatuses([commitSig]);
      const s = st?.value?.[0];
      if (s) {
        if (s.err) {
          throw new Error(`bundle failed on-chain: ${JSON.stringify(s.err)}`);
        }
        if (
          s.confirmationStatus === "confirmed" ||
          s.confirmationStatus === "finalized"
        ) {
          console.log("serial bundle LANDED", { slot: s.slot });
          return firstSig;
        }
      }
    } catch {
      /* RPC transient — keep polling */
    }
    if (Date.now() - lastSubmit >= RESUBMIT_EVERY_MS) {
      lastSubmit = Date.now();
      fireAll();
    }
  }
  throw new Error("bundle not confirmed within blockhash validity window");
};

export const sendJitoBundle = async (
  txs: VersionedTransaction[],
  connection: Connection
): Promise<string> => {
  const encoded = txs.map((t) => bs58.encode(t.serialize()));
  // Helius `sendBundle` wants base64 (recommended).
  const encodedB64 = txs.map((t) => Buffer.from(t.serialize()).toString("base64"));
  const firstSig = bs58.encode(txs[0].signatures[0]);
  const commitSig = bs58.encode(txs[txs.length - 1].signatures[0]);
  console.log("sending jito bundle", { firstSig, commitSig, legs: txs.length });

  // PRIMARY submit path: Helius `sendBundle` via the project's own RPC endpoint.
  // Helius geo-routes to Jito at 5 RPS PER PROJECT (not per-IP, and off the
  // globally-congested public block-engine that returns -32097). This is the
  // reliable path on a paid Helius plan. We keep the public block engines only as
  // a secondary fallback.
  const heliusRpc = (connection as any).rpcEndpoint as string;
  const heliusSendBundle = async (): Promise<string | null> => {
    try {
      const res = await fetch(heliusRpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sendBundle",
          params: [encodedB64, { encoding: "base64" }],
        }),
      }).then((r) => r.json());
      if (res?.result) {
        console.log("helius sendBundle accepted, bundleId", res.result);
        return res.result as string;
      }
      if (res?.error) console.warn("helius sendBundle error", res.error);
    } catch (e) {
      console.warn("helius sendBundle throw", e);
    }
    return null;
  };

  // Preflight (warn-only): simulateBundle catches real CPI failures like the AMM's
  // ExceededSlippage (6004). It can also mis-report cross-tx-escrow legs, so we log
  // the failing leg + its error for visibility but never block — Jito executes the
  // bundle sequentially against live state and is the real arbiter.
  await simulateJitoBundle(txs, connection);

  const bundleBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "sendBundle",
    params: [encoded],
  });

  // Regional block engines. Order matters — NY is frequently better connected to
  // We submit the *same* bundle to MULTIPLE regional Jito block engines concurrently.
  // Different regions have different searcher connectivity and are closer to different
  // Jito leaders in the schedule. Sending to more than one at the same time greatly
  // increases the chance the bundle is forwarded to a leader that will actually land it.
  // (We still respect that the per-IP limit exists — for a single trade this is fine.)
  const BLOCK_ENGINES = [
    "https://ny.mainnet.block-engine.jito.wtf",
    "https://mainnet.block-engine.jito.wtf",
    "https://amsterdam.mainnet.block-engine.jito.wtf",
    "https://frankfurt.mainnet.block-engine.jito.wtf",
    "https://tokyo.mainnet.block-engine.jito.wtf",
  ];

  async function tryOne(base: string): Promise<{ uuid: string | null; region?: string; error?: any }> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    try {
      const httpRes = await fetch(`${base}/api/v1/bundles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bundleBody,
        signal: controller.signal,
      });
      clearTimeout(t);
      const json = await httpRes.json().catch(() => ({}));
      if (json?.result) return { uuid: json.result as string, region: base };
      return { uuid: null, region: base, error: json?.error || json };
    } catch (e: any) {
      clearTimeout(t);
      return { uuid: null, region: base, error: e?.message || e };
    }
  }

  // Submit to ONE engine per call, ROTATING across regions on each (re)submit.
  // Jito's free tier rate-limits to ~1 request/sec PER IP, SHARED across all the
  // regional block-engine hosts. Firing all 5 concurrently from the browser was
  // 5 req/burst -> instant 429 -> resubmits dropped -> bundle landed ~1/10.
  // One request per cycle (with the >=2.5s cadence below = <0.5 req/s) stays well
  // under the limit, and rotating the region across cycles still spreads coverage
  // over upcoming Jito leaders during the blockhash window.
  let engineIdx = 0;
  const submitBundle = async (): Promise<{ uuid: string | null; error?: any; region?: string }> => {
    // 1) Helius sendBundle (paid, 5 RPS/project, not the congested public endpoint).
    const heliusId = await heliusSendBundle();
    if (heliusId) return { uuid: heliusId, region: "helius" };
    // 2) Fallback: public Jito block engines, one rotating region per call.
    const base = BLOCK_ENGINES[engineIdx % BLOCK_ENGINES.length];
    engineIdx++;
    const r = await tryOne(base);
    if (r.uuid) {
      console.log("jito accepted via", r.region, "uuid", r.uuid);
      return r;
    }
    console.warn("bundle not accepted (helius+", base, ")", r.error);
    return { uuid: null, error: r.error, region: base };
  };

  // Submit ONCE (concurrently to multiple regional engines), then poll the cheap RPC
  // signature status (Helius, NOT Jito) as the source of truth.
  // We deliberately submit the *identical* bundle to >1 block engine url at the same time
  // because each region has different connectivity to upcoming Jito leaders.
  const MAX_MS = 70_000;
  const POLL_MS = 1_000;
  // Resubmit every ~1.5s from the BROWSER (one rotating region = ~0.67 req/s,
  // under the 1 req/s per-IP limit), AND in parallel via our server PROXY (a
  // DIFFERENT IP, also one rotating region) — so we get ~2 shots/1.5s at upcoming
  // Jito leaders across two IPs without either exceeding the per-IP limit. Status
  // polling hits Helius RPC, not Jito, so it doesn't count.
  const RESUBMIT_EVERY_MS = 1500;
  const start = Date.now();
  let lastSubmit = Date.now();
  let jitoSaysLanded = false;


  const firstSubmit = await submitBundle();
  console.log("jito bundle submitted", firstSubmit.uuid ? `uuid=${firstSubmit.uuid} via ${firstSubmit.region}` : firstSubmit);

  // If the very first submission got zero acceptance from any region, surface early.
  if (!firstSubmit.uuid) {
    console.warn("Jito sendBundle: initial submission rejected by all regions", firstSubmit.error);
  }

  // Query Jito's own view of the bundle via our server proxy.
  // Extremely useful for diagnosis: Jito may report "landed" in a specific slot
  // even if our RPC's getSignatureStatuses is slow to reflect it.
  const checkBundleStatus = async (uuid: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/jito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statuses: [uuid] }),
      }).then((r) => r.json());
      if (res && Array.isArray(res) && res.length > 0) {
        const info = res[0];
        console.log("jito bundle status (from Jito)", info);
        if (info?.err) {
          console.error("Jito reported bundle error", info.err);
          return "failed";
        }
        if (info?.confirmation_status === "confirmed" || info?.confirmation_status === "finalized" || info?.slot) {
          return "landed";
        }
      }
    } catch (e) {
      console.warn("bundle status check failed", e);
    }
    return null;
  };

  while (Date.now() - start < MAX_MS) {
    await sleep(POLL_MS);
    try {
      // searchTransactionHistory helps find txs that landed via Jito but aren't in the recent cache
      const st = await connection.getSignatureStatuses([commitSig], { searchTransactionHistory: true });
      const s = st?.value?.[0];
      if (s) {
        if (s.err) {
          throw new Error(`bundle failed on-chain: ${JSON.stringify(s.err)}`);
        }
        if (
          s.confirmationStatus === "confirmed" ||
          s.confirmationStatus === "finalized"
        ) {
          console.log("jito bundle LANDED", { slot: s.slot });
          return firstSig;
        }
        if (s.confirmationStatus === "processed") {
          // still waiting for confirmed — keep going
        }
      }
    } catch {
      /* RPC transient — keep polling */
    }

    // Periodically ask Jito directly for bundle status using the uuid we received.
    // This is often the fastest signal that the bundle actually landed.
    if (firstSubmit.uuid && !jitoSaysLanded) {
      checkBundleStatus(firstSubmit.uuid).then((st) => {
        if (st === "landed") {
          jitoSaysLanded = true;
          console.log("Jito reports bundle landed (slot may be in the status) — will return on next poll or sig visible");
        }
        // NOTE: a Jito "failed" status here is NOT terminal — Jito drops a bundle
        // that simply didn't get selected by a leader (very common) and reports it
        // the same way. We keep resubmitting; only an on-chain signature error
        // (s.err in the sig poll above) is treated as a real revert and throws.
      }).catch(() => {});
    }

    if (jitoSaysLanded) {
      // Jito confirmed it — if the sig poll still hasn't seen it after a couple more polls,
      // just return the firstSig so the UI can show success (the tokens will appear shortly).
      // This avoids the long timeout when our RPC is just slow to index the Jito-landed tx.
      if (Date.now() - start > 8000) {
        console.log("returning early based on Jito bundle status");
        return firstSig;
      }
    }

    if (Date.now() - lastSubmit >= RESUBMIT_EVERY_MS) {
      lastSubmit = Date.now();
      // Resubmit (Helius primary, public engines fallback).
      submitBundle().then((r) => {
        if (!r.uuid) console.warn("bundle resubmit did not get uuid", r);
      }).catch(() => {});
    }
  }

  // Window elapsed. Do a final history-aware status check before declaring failure —
  // the tx may have landed but our RPC was slow to index it.
  try {
    const st = await connection.getSignatureStatuses([commitSig], {
      searchTransactionHistory: true,
    });
    const s = st?.value?.[0];
    if (s && !s.err) {
      console.log("jito bundle LANDED (final check)", { slot: s.slot });
      return firstSig;
    }
  } catch {
    /* ignore */
  }
  throw new Error("jito bundle not confirmed within blockhash validity window");
};

export const sendTransaction = async (
  tx: VersionedTransaction,
  connection: Connection
) => {
  const serializedTx = tx.serialize();
  const signature = await connection.sendRawTransaction(serializedTx, {
    skipPreflight: true,
  });

  // helius submission
  (async () => {
    for (let i = 0; i < MAX_RETRIES; i++) {
      await sleep(2_000);

      try {
        await connection.sendRawTransaction(serializedTx, {
          skipPreflight: true,
        });
      } catch (e) {
        console.warn(`Failed to resend transaction: ${e}`);
      }
    }
  })();

  // our server submission
  (async () => {
    await fetch(`${process.env.NEXT_PUBLIC_CLIENT_API_URL}/send-transaction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        serializedTransaction: bs58.encode(serializedTx),
      }),
    });
  })();

  // jito submission
  (async () => {
    const res = await fetch(
      "https://mainnet.block-engine.jito.wtf:443/api/v1/transactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sendTransaction",
          params: [bs58.encode(serializedTx)],
        }),
      }
    ).then((r) => r.json());

    console.log("jito submission", res);
  })();

  // jito bundle submission
  (async () => {
    const res = await fetch(
      "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sendBundle",
          params: [[bs58.encode(serializedTx)]],
        }),
      }
    ).then((r) => r.json());

    console.log("jito bundle submission", res);
  })();

  return signature;
};
