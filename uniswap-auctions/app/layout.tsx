import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "uni.fun — continuous clearing auctions",
  description:
    "A pump.fun-classic launchpad & explorer for Uniswap Continuous Clearing Auctions (Doppler) across Base, Ethereum, Unichain, Ink and Monad.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-primary min-h-screen">
        <Providers>
          <div className="flex flex-col min-h-screen">
            <NavBar />
            <main className="flex-1 w-full max-w-[1200px] mx-auto px-3 pb-20">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
