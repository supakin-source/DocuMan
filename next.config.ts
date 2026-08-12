import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` is only ever reached on Node (local development and CI). Keeping it
  // out of the server bundle stops it — and its `pg-cloudflare` require, which
  // esbuild cannot resolve for Workers — from reaching the Cloudflare build.
  serverExternalPackages: ["pg", "pg-cloudflare", "@prisma/adapter-pg"],
  /* config options here */
};

export default nextConfig;
