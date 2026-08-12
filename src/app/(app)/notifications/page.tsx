import Link from "next/link";

import { requireUser } from "@/auth";
import { BottomNav } from "@/components/bottom-nav";
import { ACTION_LABELS } from "@/components/document-timeline";
import { ScreenHeader } from "@/components/screen-header";
import { DocumentAction } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  listNotifications,
  markNotificationsRead,
} from "@/lib/domain/notifications";
import { canApprove } from "@/lib/roles";
import { formatThaiDate } from "@/lib/thai";

export const metadata = { title: "แจ้งเตือน · DocuMan" };

/** Actions that need something done, as opposed to merely reporting an outcome. */
const NEEDS_ACTION: DocumentAction[] = [
  DocumentAction.RETURNED,
  DocumentAction.SUBMITTED,
  DocumentAction.RESUBMITTED,
];

export default async function NotificationsPage() {
  const user = await requireUser();

  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { notificationsReadAt: true },
  });

  const items = await listNotifications(user.id, profile.notificationsReadAt);

  // Opening the screen is what marks them read, so the unread styling below
  // reflects the state on arrival and the badge is cleared for the next load.
  if (items.some((item) => item.unread)) {
    await markNotificationsRead(user.id);
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="แจ้งเตือน" backHref={canApprove(user.roles) ? "/approve" : "/"} />

      <div className="no-scrollbar flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pt-3.5 pb-5">
        {items.length === 0 ? (
          <div className="border border-dashed border-divider px-4 py-7 text-center">
            <p className="m-0 text-[13px] opacity-60">
              ยังไม่มีการแจ้งเตือน
              <br />
              เมื่อมีความเคลื่อนไหวกับเอกสารของคุณ จะแสดงที่นี่
            </p>
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {items.map((item) => {
              const actionable = NEEDS_ACTION.includes(item.action);

              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`flex gap-2.5 border p-3 text-inherit no-underline ${
                      item.unread
                        ? "border-accent-400 bg-accent-100"
                        : "border-divider bg-transparent"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${
                        item.unread ? "bg-accent" : "bg-transparent"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold">
                        {ACTION_LABELS[item.action]}
                        {item.detail ? `: ${item.detail}` : ""}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] opacity-55">
                        {item.docNo ?? "—"} · {item.actorName}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="text-[10px] opacity-45">
                          {formatThaiDate(item.at)}{" "}
                          {item.at.toLocaleTimeString("th-TH", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {actionable ? (
                          // Outlined on white rather than the accent-tinted chip:
                          // an unread row is itself accent-100, which the chip
                          // would vanish into.
                          <span className="border border-accent-500 bg-white px-2 py-0.5 text-[10px] font-extrabold text-accent-700">
                            ต้องดำเนินการ
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomNav variant={canApprove(user.roles) ? "approver" : "requester"} />
    </div>
  );
}
