import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Which driver reaches Postgres.
 *
 * Neon's serverless driver speaks WebSocket, which is the only way to reach
 * Postgres from a runtime without TCP sockets. `pg` is used everywhere else:
 * local development and CI run against an ordinary Postgres, which the Neon
 * driver cannot talk to — it only speaks to Neon's own proxy.
 *
 * Set DB_DRIVER to force one; otherwise it is chosen from the connection string.
 *
 * Note: both are imported statically, so both end up in a bundle. That is fine
 * on Node and is currently what blocks the Cloudflare Worker build — see the
 * deployment notes in README.
 */
function driverFor(url: string | undefined): "neon" | "pg" {
  const forced = process.env.DB_DRIVER;
  if (forced === "neon" || forced === "pg") return forced;
  return url?.includes(".neon.tech") ? "neon" : "pg";
}

// Next.js hot-reloads modules in development, which would otherwise open a new
// pool on every edit until Postgres refuses connections. Cache the client on
// globalThis so reloads reuse it.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter:
      driverFor(process.env.DATABASE_URL) === "neon"
        ? new PrismaNeon({ connectionString: process.env.DATABASE_URL })
        : new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
