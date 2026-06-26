"use client";

import Image from "next/image";
import Link from "next/link";
import { HowItWorks } from "./HowItWorks";
import { useIsClient } from "@uidotdev/usehooks";
import { Wallet } from "./Wallet";
import { LatestTrade } from "./LatestTrade";
import { WalleWithoutAuth } from "./WalletWithoutAuth";
import { LatestCoin } from "./LatestCoin";
import { SelectedChain } from "./SelectedChain";
import clsx from "clsx";
import { useProfile } from "@/providers/ProfileProvider";

const NavBar = ({ children }: { children: React.ReactNode }) => {
  const isClient = useIsClient();
  const { address, user } = useProfile();

  return (
    <div
      style={{
        display: "grid",
        height: "100vh",
        gridTemplateRows: "auto auto auto 1fr",
        alignItems: "start",
      }}
    >
      {/* <div className="border p-2 border-green-400 text-green-400">
          Charts and trades are currently being updated -- site might be affected for the next ~20 minutes.
        </div> */}

      <nav className="flex flex-wrap justify-between w-full p-2 items-start h-fit">
        <div className="flex gap-2 items-center">
          <Link href="/board">
            <Image
              src="/logo.png"
              alt="stacc.art"
              width={25}
              height={25}
              className="mr-4"
            />
          </Link>

          <div className="grid h-fit">
            <div className="flex gap-2">
              <a
                className="text-sm text-white hover:underline hover:font-bold"
                href="https://twitter.com/pumpdotfun"
                target="_blank"
                rel="noopener noreferrer"
              >
                [twitter]
              </a>

              <a
                className="text-sm text-white hover:underline hover:font-bold"
                href="https://t.me/pumpfunsupport"
                target="_blank"
                rel="noopener noreferrer"
              >
                [support]
              </a>
            </div>

            <div className="flex gap-2">
              <a
                className="text-sm text-white hover:underline hover:font-bold"
                href="https://t.me/launchonpump"
                target="_blank"
                rel="noopener noreferrer"
              >
                [telegram]
              </a>

              <a
                className="text-sm text-white hover:underline hover:font-bold"
                href="https://github.com/staccDOTsol/pumprecovery"
                target="_blank"
                rel="noopener noreferrer"
              >
                [github]
              </a>

              {isClient && <HowItWorks />}
            </div>
          </div>

          {/* CA in header/nav */}
          <a
            className="text-xs text-yellow-400 hover:underline ml-2 hidden md:inline"
            href="https://pump.fun/coin/Ha1JzNcMtzffLaivL7b4Wzoj5um7Nctcy529BbbYpump"
            target="_blank"
            rel="noopener noreferrer"
          >
            CA: Ha1JzNcMtzffLaivL7b4Wzoj5um7Nctcy529BbbYpump
          </a>

          <div className="hidden md:flex gap-2">
            <LatestTrade />
            <div className="hidden lg:block">
              <LatestCoin />
            </div>
          </div>
        </div>

        <div className="md:flex md:gap-2 grid gap-1">
          <div className="grid justify-items-end">
            {/* <Link
              href="/trading-competition"
              className="text-sm text-slate-50 hover:font-bold hover:bg-transparent hover:text-slate-50"
            >
              [trading leaderboard]
            </Link> */}

            {isClient && <Wallet />}
            {address && (
              <Link
                href={`/profile/${user?.username || address}`}
                className="text-white text-sm hover:underline relative"
              >
                [view profile]
                {Boolean(user?.unread_notifs_count) && (
                  <div className="text-white bg-red-500 px-1 rounded-full w-fit absolute top-[-6px] right-[-6px] text-xs">
                    {user?.unread_notifs_count}
                  </div>
                )}
              </Link>
            )}
          </div>

          {/* {isClient && <WalleWithoutAuth />} */}
        </div>
      </nav>

      <div className="md:hidden justify-self-center p-2 w-fit">
        <LatestTrade />
      </div>

      <div className={"justify-self-center"}>
        <SelectedChain />
      </div>

      <div className="bg-orange-700 p-1 justify-self-center rounded text-white m-4 text-center">
        Solana is facing congestion issues; This will affect how long it takes
        for your transactions to submit and the speed of raydium migrations.
        View more info{" "}
        <a
          href="https://twitter.com/0xMert_/status/1776023674098754014"
          className="text-blue-200 hover:underline"
        >
          here
        </a>
      </div>

      <main className="h-full">{children}</main>

      {/* Disclaimer + GitHub at bottom of page - rebrand to stacc.art demo */}
      <footer className="p-2 text-center text-xs text-gray-400 border-t border-gray-800 mt-4">
        <div className="max-w-2xl mx-auto">
          <strong>stacc.art</strong> — This is only a reference/historical/educational demo implementation of a pump.fun-style bonding curve.
          Not affiliated with or endorsed by pump.fun.
          <br />
          Reference CA:{" "}
          <a
            href="https://pump.fun/coin/Ha1JzNcMtzffLaivL7b4Wzoj5um7Nctcy529BbbYpump"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white"
          >
            Ha1JzNcMtzffLaivL7b4Wzoj5um7Nctcy529BbbYpump
          </a>
          {" | "}
          <a
            href="https://github.com/staccDOTsol/pumprecovery"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white"
          >
            GitHub
          </a>
        </div>
      </footer>

      {/* <Chatbox /> */}
    </div>
  );
};

export default NavBar;
