import { DocumentAction, ExpenseStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/**
 * Notifications are derived from the audit trail rather than stored.
 *
 * Every event worth telling someone about is already on DocumentEvent, so a
 * parallel table would only be a second copy to keep in step. Read state is a
 * single timestamp on the user; anything newer counts as unread.
 */
export type Notification = {
  id: string;
  documentId: string;
  docNo: string | null;
  action: DocumentAction;
  detail: string | null;
  actorName: string;
  at: Date;
  unread: boolean;
  /** Where tapping it should lead, which differs by who is being told. */
  href: string;
};

/** Verdicts the requester needs to hear about; their own actions are not news. */
const VERDICT_ACTIONS: DocumentAction[] = [
  DocumentAction.APPROVED,
  DocumentAction.RETURNED,
  DocumentAction.REJECTED,
];

const FEED_LIMIT = 50;

/**
 * What has happened to this user's documents, plus what is waiting on them as
 * an approver.
 *
 * `readAt` is the user's own marker; pass null for an account that has never
 * opened the screen, in which case everything reads as unread.
 */
export async function listNotifications(
  userId: string,
  readAt: Date | null,
): Promise<Notification[]> {
  const [verdicts, awaiting] = await Promise.all([
    // Decisions on documents this user raised.
    prisma.documentEvent.findMany({
      where: {
        action: { in: VERDICT_ACTIONS },
        document: { ownerId: userId },
        // A self-approval is impossible, but an admin acting on their own
        // document would otherwise be told about their own click.
        NOT: { actorId: userId },
      },
      orderBy: { at: "desc" },
      take: FEED_LIMIT,
      select: {
        id: true,
        action: true,
        detail: true,
        actorName: true,
        at: true,
        documentId: true,
        document: { select: { docNo: true } },
      },
    }),

    // Submissions waiting for this user to decide.
    prisma.documentEvent.findMany({
      where: {
        action: { in: [DocumentAction.SUBMITTED, DocumentAction.RESUBMITTED] },
        document: {
          status: ExpenseStatus.PENDING,
          ownerId: { not: userId },
          owner: { approverId: userId },
        },
      },
      orderBy: { at: "desc" },
      take: FEED_LIMIT,
      select: {
        id: true,
        action: true,
        detail: true,
        actorName: true,
        at: true,
        documentId: true,
        document: { select: { docNo: true } },
      },
    }),
  ]);

  const isUnread = (at: Date) => !readAt || at > readAt;

  const items: Notification[] = [
    ...verdicts.map((event) => ({
      id: event.id,
      documentId: event.documentId,
      docNo: event.document.docNo,
      action: event.action,
      detail: event.detail,
      actorName: event.actorName,
      at: event.at,
      unread: isUnread(event.at),
      href: `/documents/${event.documentId}`,
    })),
    ...awaiting.map((event) => ({
      id: event.id,
      documentId: event.documentId,
      docNo: event.document.docNo,
      action: event.action,
      detail: event.detail,
      actorName: event.actorName,
      at: event.at,
      unread: isUnread(event.at),
      // An approver lands on the review screen, not the read-only view.
      href: `/approve/${event.documentId}`,
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, FEED_LIMIT);
}

/** How many unread items the tab bar should badge. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationsReadAt: true },
  });

  const items = await listNotifications(userId, user?.notificationsReadAt ?? null);
  return items.filter((item) => item.unread).length;
}

/** Marks everything up to now as read. */
export async function markNotificationsRead(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { notificationsReadAt: new Date() },
  });
}
