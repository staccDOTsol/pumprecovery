import { http, createConfig } from "wagmi";
import { mainnet, base } from "viem/chains";
import { injected, coinbaseWallet, walletConnect } from "wagmi/connectors";
import { unichain, ink, monad } from "./chains";

const wcId = process.env.NEXT_PUBLIC_WALLETCONNECT_ID;

const connectors = [
  injected({ shimDisconnect: true }),
  coinbaseWallet({ appName: "uni.fun" }),
  ...(wcId ? [walletConnect({ projectId: wcId, showQrModal: true })] : []),
];

export const wagmiConfig = createConfig({
  chains: [base, mainnet, unichain, ink, monad],
  connectors,
  // SSR-safe: wagmi reads no storage on the server.
  ssr: true,
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_BASE),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_RPC_MAINNET),
    [unichain.id]: http(),
    [ink.id]: http(),
    [monad.id]: http(),
  },
});

/** Union of the chain ids this app's wagmi config knows about. */
export type SupportedChainId = (typeof wagmiConfig)["chains"][number]["id"];

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
