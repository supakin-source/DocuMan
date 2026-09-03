import "dotenv/config";

import { prisma } from "@/lib/db";

/**
 * A read-only snapshot of who is who — roles, and who approves whom.
 *
 * Exists for the same reason `pnpm line:link` has a workflow: setting this up
 * is being done from a browser with no terminal, and there was no way to see
 * this without one. Changes nothing; only reads.
 *
 *   pnpm users:list
 */
async function main() {
  const users = await prisma.user.findMany({
    orderBy: [{ email: "asc" }],
    select: {
      email: true,
      name: true,
      roles: true,
      lineUserId: true,
      approver: { select: { email: true, name: true } },
    },
  });

  if (users.length === 0) {
    console.log("No users yet.");
    return;
  }

  for (const user of users) {
    console.log(`${user.email}  (${user.name ?? "no name"})`);
    console.log(`  roles: ${user.roles.join(", ") || "none"}`);
    console.log(`  LINE: ${user.lineUserId ? "linked" : "not linked"}`);
    console.log(
      `  approver: ${user.approver ? `${user.approver.email} (${user.approver.name ?? "no name"})` : "none set"}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
