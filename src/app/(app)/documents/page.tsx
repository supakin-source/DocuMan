import { requireUser } from "@/auth";
import { BottomNav } from "@/components/bottom-nav";
import { DocumentRow } from "@/components/document-row";
import { ScreenHeader } from "@/components/screen-header";
import { StatusFilter } from "@/components/status-filter";
import { ExpenseStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { listOwnDocuments } from "@/lib/domain/documents";
import { countUnreadNotifications } from "@/lib/domain/notifications";
import { formatMoney } from "@/lib/thai";

export const metadata = { title: "เอกสารของฉัน · DocuMan" };

/** Drafts are excluded: they are an unfinished submission, not a document yet. */
const FILTERS: ExpenseStatus[] = [
  ExpenseStatus.PENDING,
  ExpenseStatus.CORRECTION,
  ExpenseStatus.APPROVED,
  ExpenseStatus.REJECTED,
];

function parseStatus(value: string | string[] | undefined): ExpenseStatus | null {
  return typeof value === "string" && FILTERS.includes(value as ExpenseStatus)
    ? (value as ExpenseStatus)
    : null;
}

export default async function MyDocumentsPage({ searchParams }: PageProps<"/documents">) {
  const user = await requireUser();
  const { status } = await searchParams;
  const active = parseStatus(status);

  const [documents, grouped, unread] = await Promise.all([
    listOwnDocuments(user.id, { status: active ?? undefined, take: 100 }),
    prisma.expenseDocument.groupBy({
      by: ["status"],
      where: { ownerId: user.id, status: { not: ExpenseStatus.DRAFT } },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    countUnreadNotifications(user.id),
  ]);

  const counts = Object.fromEntries(
    grouped.map((row) => [row.status, row._count._all]),
  ) as Partial<Record<ExpenseStatus, number>>;

  const shownTotal = documents.reduce((sum, doc) => sum + Number(doc.totalAmount), 0);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="เอกสารของฉัน" backHref="/" />

      <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3.5 pb-5">
        <StatusFilter
          basePath="/documents"
          active={active}
          options={FILTERS}
          counts={counts}
        />

        <div className="flex items-baseline justify-between border-b border-divider pb-2">
          <span className="text-xs opacity-55">{documents.length} รายการ</span>
          <span className="font-[family-name:var(--font-heading)] text-sm font-extrabold">
            ฿{formatMoney(shownTotal)}
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="border border-dashed border-divider px-4 py-7 text-center">
            <p className="m-0 text-[13px] opacity-60">
              {active ? "ไม่มีเอกสารในสถานะนี้" : "ยังไม่มีเอกสาร"}
            </p>
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {documents.map((doc) => (
              <li key={doc.id}>
                <DocumentRow
                  href={`/documents/${doc.id}`}
                  title="ค่าเดินทาง"
                  subtitle={doc.docNo ?? "ยังไม่มีเลขที่"}
                  amount={Number(doc.totalAmount)}
                  date={doc.submittedAt ?? doc.createdAt}
                  status={doc.status}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <BottomNav variant="requester" unreadCount={unread} />
    </div>
  );
}
