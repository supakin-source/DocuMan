import { redirect } from "next/navigation";

import { requireUser } from "@/auth";
import { BottomNav } from "@/components/bottom-nav";
import { DocumentRow } from "@/components/document-row";
import { ScreenHeader } from "@/components/screen-header";
import { StatusFilter } from "@/components/status-filter";
import { ExpenseStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { listDecidedByApprover } from "@/lib/domain/documents";
import { countUnreadNotifications } from "@/lib/domain/notifications";
import { canApprove } from "@/lib/roles";
import { formatMoney } from "@/lib/thai";

export const metadata = { title: "ประวัติการอนุมัติ · DocuMan" };

/** The three ways a decision can land. */
const FILTERS: ExpenseStatus[] = [
  ExpenseStatus.APPROVED,
  ExpenseStatus.CORRECTION,
  ExpenseStatus.REJECTED,
];

function parseStatus(value: string | string[] | undefined): ExpenseStatus | null {
  return typeof value === "string" && FILTERS.includes(value as ExpenseStatus)
    ? (value as ExpenseStatus)
    : null;
}

export default async function ApprovalHistoryPage({
  searchParams,
}: PageProps<"/approve/history">) {
  const user = await requireUser();
  if (!canApprove(user.roles)) redirect("/");

  const { status } = await searchParams;
  const active = parseStatus(status);

  const [documents, grouped, unread] = await Promise.all([
    listDecidedByApprover(user.id, { status: active ?? undefined }),
    prisma.expenseDocument.groupBy({
      by: ["status"],
      where: { decidedById: user.id },
      _count: { _all: true },
    }),
    countUnreadNotifications(user.id),
  ]);

  const counts = Object.fromEntries(
    grouped.map((row) => [row.status, row._count._all]),
  ) as Partial<Record<ExpenseStatus, number>>;

  // Only approvals moved money; returns and rejections did not.
  const approvedTotal = documents
    .filter((doc) => doc.status === ExpenseStatus.APPROVED)
    .reduce((sum, doc) => sum + Number(doc.totalAmount), 0);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="ประวัติการอนุมัติ" backHref="/approve" />

      <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3.5 pb-5">
        <StatusFilter
          basePath="/approve/history"
          active={active}
          options={FILTERS}
          counts={counts}
        />

        <div className="flex items-baseline justify-between border-b border-divider pb-2">
          <span className="text-xs opacity-55">{documents.length} รายการ</span>
          <span className="text-xs opacity-55">
            อนุมัติแล้ว{" "}
            <b className="font-[family-name:var(--font-heading)] text-sm">
              ฿{formatMoney(approvedTotal)}
            </b>
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="border border-dashed border-divider px-4 py-7 text-center">
            <p className="m-0 text-[13px] opacity-60">
              {active ? "ไม่มีรายการในสถานะนี้" : "ยังไม่มีประวัติการพิจารณา"}
            </p>
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {documents.map((doc) => (
              <li key={doc.id}>
                <DocumentRow
                  href={`/approve/${doc.id}`}
                  title={doc.owner.name ?? "—"}
                  subtitle={`${doc.owner.position ?? "—"} · ${doc.docNo ?? "—"}`}
                  amount={Number(doc.totalAmount)}
                  date={doc.decidedAt}
                  status={doc.status}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <BottomNav variant="approver" unreadCount={unread} />
    </div>
  );
}
