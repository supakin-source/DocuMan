import "dotenv/config";

import { AppRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/**
 * Grants the ADMIN role, so someone can reach /admin and set up everyone else.
 *
 *   pnpm admin:grant someone@assetfive.co.th
 *
 * The account must already exist, which means signing in with Google once
 * first. Creating the row here instead would leave a User with no linked
 * Account, and Auth.js refuses to attach an OAuth identity to one of those —
 * the person would be locked out with "OAuthAccountNotLinked".
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error("Usage: pnpm admin:grant <email>");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, roles: true },
  });

  if (!user) {
    console.error(
      `No account for ${email}.\n` +
        "Ask them to sign in with Google once, then run this again.",
    );
    process.exitCode = 1;
    return;
  }

  if (user.roles.includes(AppRole.ADMIN)) {
    console.log(`${email} is already an admin.`);
    return;
  }

  const roles = [...user.roles, AppRole.ADMIN];
  await prisma.user.update({ where: { id: user.id }, data: { roles } });

  console.log(`Granted ADMIN to ${user.name ?? email}. Roles: ${roles.join(", ")}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
