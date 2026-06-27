import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getBrand, getBrandOrigin } from "@/lib/brand";
import "./globals.css";
import { SolanaWalletProvider } from "../providers/WalletProvider";
import { LinkedXProvider } from "@/providers/LinkedXProvider";
import { Analytics } from "@vercel/analytics/react";
import { SocketProvider } from "@/providers/SocketProvider";
import { IpfsPrefixProvider } from "@/providers/IpfsPrefixProvider";
import { PriorityFeeProvider } from "@/providers/PriorityFeeProvider";
import { RpcUrlProvider } from "@/providers/RpcUrlProvider";
import { ProfileProvider } from "@/providers/ProfileProvider";

const inter = Inter({ subsets: ["latin"] });

const BRAND = getBrand();
const ORIGIN = getBrandOrigin();
const TITLE = `${BRAND} — Solana bonding-curve launchpad`;
const DESC =
  `${BRAND} is an independent, open on-chain token launchpad on Solana where every trade permanently adds Orca liquidity, rewards referrers, and buys & burns. Not affiliated with or endorsed by any other launchpad.`;

export const metadata: Metadata = {
  metadataBase: new URL(ORIGIN),
  title: TITLE,
  description: DESC,
  applicationName: BRAND,
  icons: {
    icon: "/logo.png",
  },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: ORIGIN,
    siteName: BRAND,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <SocketProvider>
        <RpcUrlProvider>
          <SolanaWalletProvider>
            <ProfileProvider>
              <PriorityFeeProvider>
                  <IpfsPrefixProvider>
                    <body className={`${inter.className} bg-primary`} suppressHydrationWarning>
                      {children} <Analytics />
                    </body>
                  </IpfsPrefixProvider>
              </PriorityFeeProvider>
            </ProfileProvider>
          </SolanaWalletProvider>
        </RpcUrlProvider>
      </SocketProvider>
    </html>
  );
}
