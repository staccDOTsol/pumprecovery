/** @type {import('next').NextConfig} */

// Public, shareable defaults so a fresh fork/mirror deploy points at the SAME
// shared backends with zero config. Any value set in the environment (local
// .env, Vercel project env, or the 1-click deploy prompts) overrides these.
// NOTE: only non-secret, browser-exposed values belong here. Secrets
// (SUPABASE_KEY, BIRDEYE_API_KEY, PINATA_*) are never baked — see .env.example.
const withDefault = (key, fallback) => {
  const v = process.env[key];
  return v && v.trim() ? v : fallback;
};

const SHARED_DEFAULTS = {
  NEXT_PUBLIC_API_URL: "https://pump-api-server-6d0f94f3b186.herokuapp.com",
  NEXT_PUBLIC_CLIENT_API_URL: "https://pump-client-server-ddd5e3eed248.herokuapp.com",
  NEXT_PUBLIC_PUMP_PROGRAM_ID: "67LWrtDBPyZqS7SzCYZWBLgPBqZAG94GTfMWEBG2fnuV",
  // Shared Helius RPC so every fork/mirror works out of the box (websockets +
  // getProgramAccounts etc. — the public mainnet-beta endpoint 403s/has no ws).
  // Override NEXT_PUBLIC_SOLANA_API_URL with your own key to use your own quota.
  NEXT_PUBLIC_SOLANA_API_URL:
    "https://mainnet.helius-rpc.com/?api-key=dc8a996c-1c31-4960-b000-c4586d54f4bb",
  NEXT_PUBLIC_SOLANA_API_URL2:
    "https://mainnet.helius-rpc.com/?api-key=dc8a996c-1c31-4960-b000-c4586d54f4bb",
  NEXT_PUBLIC_ENABLE_ADD_LIQ: "true",
  NEXT_PUBLIC_OPEN_VENUES_ON_CREATE: "false",
};

const env = Object.fromEntries(
  Object.entries(SHARED_DEFAULTS).map(([k, d]) => [k, withDefault(k, d)])
);

const nextConfig = {
  images: {
    domains: ["pbs.twimg.com"],
  },
  env,
};

module.exports = nextConfig;
