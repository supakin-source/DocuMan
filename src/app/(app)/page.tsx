import Link from "next/link";

import { requireUser } from "@/auth";
import { ExpenseStatus } from "@/generated/prisma/enums";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { AlertMark, StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { listOwnDocuments, listPendingForApprover } from "@/lib/domain/documents";
import { countUnreadNotifications } from "@/lib/domain/notifications";
import { canApprove, canRequest, isAdmin } from "@/lib/roles";
import { formatMoney, formatThaiDate } from "@/lib/thai";

export const metadata = { title: "หน้าหลัก · DocuMan" };

type Search = { filter?: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const { filter } = await searchParams;

  const activeFilter =
    filter === "pending"
      ? ExpenseStatus.PENDING
      : filter === "correction"
        ? ExpenseStatus.CORRECTION
        : undefined;

  const [profile, documents, counts, approverQueue, unread] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true, position: true, department: true },
    }),
    listOwnDocuments(user.id, { status: activeFilter, take: 10 }),
    prisma.expenseDocument.groupBy({
      by: ["status"],
      where: { ownerId: user.id },
      _count: { _all: true },
    }),
    canApprove(user.roles) ? listPendingForApprover(user.id) : Promise.resolve([]),
    countUnreadNotifications(user.id),
  ]);

  const countOf = (status: ExpenseStatus) =>
    counts.find((row) => row.status === status)?._count._all ?? 0;

  const pendingCount = countOf(ExpenseStatus.PENDING);
  const correctionCount = countOf(ExpenseStatus.CORRECTION);

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        name={profile.name ?? "ผู้ใช้งาน"}
        subtitle={profile.position ?? profile.department ?? "—"}
        switchTo={
          canApprove(user.roles)
            ? { href: "/approve", label: "สลับมุมมองเป็นผู้อนุมัติ (บัญชีเดิม)" }
            : null
        }
        badgeCount={approverQueue.length}
        showAdmin={isAdmin(user.roles)}
      />

      <div className="no-scrollbar flex flex-1 flex-col gap-[18px] overflow-y-auto px-4 pt-[18px] pb-5">
        {canRequest(user.roles) ? (
          <Link href="/create" className="btn btn-primary btn-block p-3.5 text-base">
            ＋ สร้างเอกสารใหม่
          </Link>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          <FilterCard
            href={filter === "pending" ? "/" : "/?filter=pending"}
            active={filter === "pending"}
            count={pendingCount}
            label="รออนุมัติ"
          />
          <FilterCard
            href={filter === "correction" ? "/" : "/?filter=correction"}
            active={filter === "correction"}
            count={correctionCount}
            label="ต้องแก้ไข"
            tone="accent"
          />
        </div>

        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="m-0 text-sm">เอกสารล่าสุด</h3>
            <span className="text-xs opacity-50">{documents.length} รายการ</span>
          </div>

          {documents.length === 0 ? (
            <div className="border border-dashed border-divider px-4 py-7 text-center">
              <p className="m-0 text-[13px] opacity-60">
                ยังไม่มีเอกสาร
                <br />
                เริ่มสร้างเอกสารแรกของคุณ
              </p>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <Link
                    href={`/documents/${doc.id}`}
                    className="block border border-divider p-3 text-inherit no-underline"
                  >
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-[family-name:var(--font-heading)] text-sm font-extrabold">
                          ค่าเดินทาง
                        </div>
                        <div className="mt-0.5 text-[11px] opacity-55">
                          {doc.docNo ?? "ยังไม่มีเลขที่"} ·{" "}
                          {formatThaiDate(doc.submittedAt ?? doc.createdAt)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-[family-name:var(--font-heading)] text-[15px] font-extrabold">
                        ฿{formatMoney(Number(doc.totalAmount))}
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <StatusBadge status={doc.status} />
                      <AlertMark status={doc.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <BottomNav variant="requester" unreadCount={unread} />
    </div>
  );
}

function FilterCard({
  href,
  active,
  count,
  label,
  tone = "neutral",
}: {
  href: string;
  active: boolean;
  count: number;
  label: string;
  tone?: "neutral" | "accent";
}) {
  const accent = tone === "accent";
  const border = active
    ? accent
      ? "border-2 border-accent-700 p-[13px]"
      : "border-2 border-text p-[13px]"
    : accent
      ? "border border-accent-300 p-3.5"
      : "border border-divider p-3.5";

  return (
    <Link
      href={href}
      aria-pressed={active}
      className={`block text-inherit no-underline ${border} ${accent ? "bg-accent-100" : ""}`}
    >
      <div
        className={`font-[family-name:var(--font-heading)] text-[26px] font-extrabold ${
          accent ? "text-accent-700" : ""
        }`}
      >
        {count}
      </div>
      <div
        className={`mt-0.5 text-xs ${accent ? "text-accent-700 opacity-75" : "opacity-60"}`}
      >
        {label}
      </div>
    </Link>
  );
}
