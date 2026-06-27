"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

function NavLink({ href, children, accent }: { href: string; children: string; accent?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`bracket-link text-sm hover:font-bold ${
        accent ? "text-green-300 hover:text-green-200" : "text-white"
      } ${active ? "font-bold" : ""}`}
    >
      {children}
    </Link>
  );
}

export function NavBar() {
  return (
    <nav className="flex flex-wrap justify-between items-center w-full p-3 gap-3">
      <div className="flex items-center gap-4">
        <Link href="/board" className="flex items-center gap-2">
          <span className="text-green-300 text-xl font-black tracking-tight">uni.fun</span>
          <span className="hidden sm:inline text-[10px] text-gray-500 border border-gray-700 rounded px-1 py-0.5">
            CCA launchpad
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-3">
          <NavLink href="/board">board</NavLink>
          <NavLink href="/create" accent>
            start auction
          </NavLink>
          <a
            href="https://docs.doppler.lol"
            target="_blank"
            rel="noreferrer"
            className="bracket-link text-sm text-white hover:font-bold"
          >
            docs
          </a>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/create"
          className="md:hidden bracket-link text-sm text-green-300 hover:font-bold"
        >
          start auction
        </Link>
        <WalletButton />
      </div>
    </nav>
  );
}
