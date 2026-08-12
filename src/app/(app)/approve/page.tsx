import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { ExpenseStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  listApprovedByApprover,
  listPendingForApprover,
} from "@/lib/domain/documents";
import { countUnreadNotifications } from "@/lib/domain/notifications";
import { summariseMonth } from "@/lib/domain/stats";
import { canApprove, canRequest, isAdmin } from "@/lib/roles";
import { formatMoney, formatThaiDate } from "@/lib/thai";

export const metadata = { title: "ผู้อนุมัติ · DocuMan" };

export default async function ApproveDashboardPage({
  searchParams,
}: PageProps<"/approve">) {
  const user = await requireUser();
  if (!canApprove(user.roles)) redirect("/");

  const { m } = await searchParams;
  const rawOffset = Number.parseInt(typeof m === "string" ? m : "", 10);
  // Clamped at 0: there is nothing to show in the future.
  const offset = Number.isFinite(rawOffset) ? Math.min(0, rawOffset) : 0;

  const [profile, pending, approved, correctionCount, unread] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true, position: true },
    }),
    listPendingForApprover(user.id),
    listApprovedByApprover(user.id),
    prisma.expenseDocument.count({
      where: { ownerId: user.id, status: ExpenseStatus.CORRECTION },
    }),
    countUnreadNotifications(user.id),
  ]);

  const stats = summariseMonth(approved, offset);
  const trendMax = Math.max(1, ...stats.trend.map((month) => month.total));
  const oldest = pending.at(0);

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        name={profile.name ?? "ผู้ใช้งาน"}
        subtitle={`${profile.position ?? "—"} · มุมมองผู้อนุมัติ`}
        switchTo={
          canRequest(user.roles)
            ? { href: "/", label: "สลับมุมมองเป็นผู้จัดทำ (บัญชีเดิม)" }
            : null
        }
        badgeCount={correctionCount}
        showAdmin={isAdmin(user.roles)}
      />

      <div className="no-scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-[18px] pb-5">
        <div className="flex items-stretch border-2 border-accent bg-accent text-white">
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3">
            <div className="font-[family-name:var(--font-heading)] text-[38px] leading-[0.85] font-extrabold tracking-tighter">
              {pending.length}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold tracking-widest uppercase">
                รออนุมัติ
              </div>
              <div className="mt-0.5 text-[10.5px] opacity-85">
                {oldest
                  ? `รายการเก่าสุดส่งเมื่อ ${formatThaiDate(oldest.submittedAt)}`
                  : "คุณตรวจสอบครบทุกรายการแล้ว"}
              </div>
            </div>
          </div>
        </div>

        <section className="border border-divider bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-divider px-3.5 py-2.5">
            <div className="text-[9.5px] font-extrabold tracking-widest uppercase opacity-50">
              ล่าสุด
            </div>
            <div className="flex items-center gap-1">
              <Link
                href={`/approve?m=${offset - 1}`}
                className="icon-btn h-6 w-6"
                aria-label="เดือนก่อนหน้า"
              >
                <ChevronLeftIcon size={12} />
              </Link>
              <span className="min-w-[86px] text-center text-[11.5px] font-extrabold">
                {stats.label}
              </span>
              {offset >= 0 ? (
                <span className="icon-btn h-6 w-6 opacity-40" aria-hidden>
                  <ChevronRightIcon size={12} />
                </span>
              ) : (
                <Link
                  href={`/approve?m=${offset + 1}`}
                  className="icon-btn h-6 w-6"
                  aria-label="เดือนถัดไป"
                >
                  <ChevronRightIcon size={12} />
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-end justify-between gap-3 p-3.5">
            <div>
              <div className="font-[family-name:var(--font-heading)] text-[26px] leading-tight font-extrabold">
                ฿{formatMoney(stats.total)}
              </div>
              <div className="mt-1 text-[10.5px] opacity-55">
                {stats.count} รายการ · เฉลี่ย ฿{formatMoney(stats.average)}
              </div>
            </div>

            <div className="flex h-[42px] items-end gap-[5px]">
              {stats.trend.map((month) => {
                const selected = month.key === stats.key;
                const height = Math.max(3, Math.round((month.total / trendMax) * 32));
                return (
                  <Link
                    key={month.key}
                    href={`/approve?m=${month.offset}`}
                    title={month.label}
                    className="flex w-[15px] flex-col items-center gap-1"
                  >
                    <span
                      className={`w-full ${selected ? "bg-accent" : "bg-neutral-300"}`}
                      style={{ height }}
                    />
                    <span
                      className={`text-[8.5px] ${selected ? "font-extrabold opacity-90" : "opacity-45"}`}
                    >
                      {month.short}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {stats.rows.length > 0 ? (
            <ul className="m-0 flex list-none flex-col border-t border-divider p-0">
              {stats.rows.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center gap-2.5 border-b border-neutral-200 px-3.5 py-2.5"
                >
                  <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                    <span className="truncate text-xs font-bold">{row.name}</span>
                    <span className="shrink-0 text-[10px] opacity-45">
                      {row.count} รายการ
                    </span>
                  </div>
                  <div className="shrink-0 font-[family-name:var(--font-heading)] text-[12.5px] font-extrabold">
                    ฿{formatMoney(row.amount)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-divider p-3.5 text-[11.5px] opacity-50">
              ยังไม่มีรายการที่อนุมัติในเดือนนี้
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2.5 text-sm">รายการรออนุมัติ</h3>
          {pending.length === 0 ? (
            <div className="border border-dashed border-divider px-4 py-7 text-center">
              <p className="m-0 text-[13px] opacity-60">ไม่มีรายการรออนุมัติ</p>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {pending.map((doc) => (
                <li key={doc.id}>
                  <Link
                    href={`/approve/${doc.id}`}
                    className="block border border-divider p-3 text-inherit no-underline"
                  >
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-[family-name:var(--font-heading)] text-sm font-extrabold">
                          {doc.owner.name}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] opacity-55">
                          {doc.owner.position ?? "—"} · ค่าเดินทาง
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-[family-name:var(--font-heading)] text-[15px] font-extrabold">
                        ฿{formatMoney(Number(doc.totalAmount))}
                      </div>
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] opacity-55">
                      <span className="truncate">{doc.project ?? "—"}</span>
                      <span className="shrink-0">{formatThaiDate(doc.submittedAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <BottomNav variant="approver" unreadCount={unread} />
    </div>
  );
}
