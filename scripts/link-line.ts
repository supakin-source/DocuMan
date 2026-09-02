import "dotenv/config";

import { prisma } from "@/lib/db";

/**
 * Points an existing account at a LINE user id, so the bot recognises them.
 *
 *   pnpm line:link someone@assetfive.co.th U1234567890abcdef...
 *
 * The LINE id is the opaque `source.userId` on every webhook event. Someone
 * who has added the OA but is not linked yet is shown their own id and told to
 * pass it to an admin, which is where the second argument comes from.
 *
 * Linking is an admin step rather than something the bot works out from a chat
 * message on purpose: a person can type any colleague's e-mail address into a
 * chat, so letting that claim link an account would let anyone file expenses as
 * anyone else. Only an admin can run this.
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const lineUserId = process.argv[3]?.trim();

  if (!email || !lineUserId) {
    console.error("Usage: pnpm line:link <email> <lineUserId>");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, lineUserId: true },
  });

  if (!user) {
    console.error(`No account for ${email}.`);
    process.exitCode = 1;
    return;
  }

  const alreadyTaken = await prisma.user.findUnique({
    where: { lineUserId },
    select: { email: true },
  });

  if (alreadyTaken && alreadyTaken.email !== email) {
    console.error(
      `That LINE id is already linked to ${alreadyTaken.email}.\n` +
        "Unlink it there first if the account really has changed hands.",
    );
    process.exitCode = 1;
    return;
  }

  if (user.lineUserId && user.lineUserId !== lineUserId) {
    console.log(`Replacing ${email}'s previous LINE id ${user.lineUserId}.`);
  }

  await prisma.user.update({ where: { id: user.id }, data: { lineUserId } });

  console.log(`Linked ${user.name ?? email} to LINE id ${lineUserId}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
