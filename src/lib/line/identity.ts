import { AppRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/**
 * Who is on the other end of a LINE conversation.
 *
 * There is no sign-in here: the only evidence of identity is the opaque
 * `source.userId` LINE puts on every event. That is enough to *recognise*
 * someone already linked, but not to decide who a stranger is — so linking is
 * an admin action (`pnpm line:link`), never something the bot infers from what
 * a person claims about themselves in a chat message. Anyone could type a
 * colleague's e-mail address; nobody but an admin can put it in the database.
 */

export type LineUser = {
  id: string;
  name: string | null;
  roles: AppRole[];
  approverId: string | null;
};

/** The account linked to this LINE id, or null when nobody has linked it. */
export async function findUserByLineId(lineUserId: string): Promise<LineUser | null> {
  return prisma.user.findUnique({
    where: { lineUserId },
    select: { id: true, name: true, roles: true, approverId: true },
  });
}

export function isApprover(user: LineUser): boolean {
  return user.roles.includes(AppRole.APPROVER);
}

/**
 * The admins the approved document is sent to.
 *
 * Only those who have linked LINE, because there is nowhere else to send it —
 * an admin who has not linked is not a failure to report to the approver, who
 * cannot do anything about it, but it is worth a line in the log.
 */
export async function listAdminLineIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { roles: { has: AppRole.ADMIN }, lineUserId: { not: null } },
    select: { lineUserId: true },
    orderBy: { email: "asc" },
  });

  return admins
    .map((admin) => admin.lineUserId)
    .filter((id): id is string => Boolean(id));
}

export function isAdmin(user: LineUser): boolean {
  return user.roles.includes(AppRole.ADMIN);
}
