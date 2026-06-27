/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Token images come from arbitrary IPFS gateways / project CDNs.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // wagmi/viem pull in optional WalletConnect deps that are noisy under webpack.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

module.exports = nextConfig;
