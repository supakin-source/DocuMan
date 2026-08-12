import "dotenv/config";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Confirms DATABASE_URL is actually reachable, independent of which adapter
 * the app itself is wired to use — so this keeps working across whatever
 * `src/lib/db.ts` looks like on this branch.
 *
 *   pnpm verify:db
 *
 * Exists because `prisma migrate deploy` reports success on schema changes
 * but says nothing when there is nothing new to apply, which reads the same
 * as "never tried to connect." A plain query removes that ambiguity.
 */
async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const isNeon = url.includes(".neon.tech");

  console.log(`Connecting via the ${isNeon ? "neon" : "pg"} driver...`);

  const adapter = isNeon
    ? new PrismaNeon({ connectionString: url })
    : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  const start = Date.now();
  const [userCount, docCount] = await Promise.all([
    prisma.user.count(),
    prisma.expenseDocument.count(),
  ]);
  const elapsedMs = Date.now() - start;

  console.log(`Connected in ${elapsedMs}ms.`);
  console.log(`User rows: ${userCount}`);
  console.log(`ExpenseDocument rows: ${docCount}`);

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error("Failed to connect:", error);
  process.exitCode = 1;
});
