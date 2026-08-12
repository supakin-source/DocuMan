import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 dropped the bundled query engine: a driver adapter is now required.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Next.js hot-reloads modules in development, which would otherwise open a new
// pool on every edit until Postgres refuses connections. Cache the client on
// globalThis so reloads reuse it.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
