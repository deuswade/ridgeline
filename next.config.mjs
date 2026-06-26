/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // These run server-side in the API route; keep them external so Next does
    // not re-bundle them (faster route compile, avoids interop issues).
    serverComponentsExternalPackages: ["pdf-lib", "@li0ard/wsq", "@pdf-lib/upng"],
  },
};

export default nextConfig;
