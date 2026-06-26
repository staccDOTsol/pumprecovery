/**
 * Turn raw wallet-adapter errors into human guidance.
 *
 * The notable one: Mobile Wallet Adapter (MWA) connects to the wallet app's
 * local WebSocket (`ws://localhost:<port>/solana-wallet`). Modern mobile
 * browsers now block local-network connections by default ("Local Network
 * Access" permission), and MWA only works on Android with a compatible wallet
 * app — so this fails for many mobile users. The fix is user-side, so surface
 * actionable guidance instead of the raw `ws://localhost…` string.
 */
export function humanizeWalletError(e: unknown): string {
  const raw =
    (e as any)?.message != null ? String((e as any).message) : String(e ?? "");
  const low = raw.toLowerCase();

  if (
    low.includes("wallet websocket") ||
    low.includes("/solana-wallet") ||
    low.includes("ws://localhost") ||
    low.includes("mobile wallet adapter")
  ) {
    return (
      "Couldn't reach your mobile wallet. On a phone, open stacc.art inside your " +
      "wallet's built-in browser (Phantom or Solflare → Browser tab), or allow the " +
      "browser's “local network” permission when it prompts, then reconnect and try " +
      "again. A desktop browser with a wallet extension also works."
    );
  }

  if (
    (e as any)?.code === 4001 ||
    low.includes("user rejected") ||
    low.includes("rejected the request")
  ) {
    return "You rejected the request in your wallet.";
  }

  if (low.includes("blockhash") || low.includes("block height exceeded")) {
    return "The transaction expired before it landed. Please try again.";
  }

  return raw || "Unknown error";
}
