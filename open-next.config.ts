import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Cloudflare cannot run a Next.js build directly; OpenNext adapts it into a
 * Worker plus a static-asset bundle.
 *
 * No incremental cache is configured: every route in this app is dynamic and
 * per-user — a claim, a queue, a signature — so there is nothing to cache
 * between requests that would not be a privacy problem.
 */
export default defineCloudflareConfig();
