import "dotenv/config";

import { prisma } from "@/lib/db";

/**
 * Confirms DATABASE_URL is actually reachable and picks the driver `src/lib/db`
 * would pick — the same file `pnpm db:deploy` and the app itself use.
 *
 *   pnpm verify:db
 *
 * Exists because `prisma migrate deploy` reports success on schema changes but
 * says nothing when there is nothing new to apply, which reads the same as
 * "never tried to connect." A plain query removes that ambiguity.
 */
async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const driver = url.includes(".neon.tech") ? "neon" : "pg";

  console.log(`Connecting via the ${driver} driver...`);

  const start = Date.now();
  const [userCount, docCount] = await Promise.all([
    prisma.user.count(),
    prisma.expenseDocument.count(),
  ]);
  const elapsedMs = Date.now() - start;

  console.log(`Connected in ${elapsedMs}ms.`);
  console.log(`User rows: ${userCount}`);
  console.log(`ExpenseDocument rows: ${docCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Failed to connect:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
