import type { Metadata } from "next";
import { Inter } from "next/font/google";
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

export const metadata: Metadata = {
  title: "stacc.art",
  description:
    "stacc.art - reference/historical/educational demo implementation of pump.fun style bonding curve. Not affiliated. Reference: https://pump.fun/coin/Ha1JzNcMtzffLaivL7b4Wzoj5um7Nctcy529BbbYpump",
  icons: {
    icon: "/logo.png",
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
