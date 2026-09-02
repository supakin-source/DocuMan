import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Left for the server to require at runtime rather than bundled.
   *
   * `@sparticuz/chromium` is a ~50 MB Brotli-compressed browser it unpacks to
   * /tmp on first use, and `puppeteer-core` reaches for files beside itself.
   * Bundling either rewrites the paths they resolve against and the browser
   * stops being findable — the classic way this breaks on a serverless host,
   * and one that only shows up in production.
   */
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
