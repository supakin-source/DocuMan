import Link from "next/link";

import { AlertMark, StatusBadge } from "@/components/status-badge";
import type { ExpenseStatus } from "@/generated/prisma/enums";
import { formatMoney, formatThaiDate } from "@/lib/thai";

/**
 * One document in a list. Used by both the requester's and the approver's
 * screens, which differ only in whose name is worth showing.
 */
export function DocumentRow({
  href,
  title,
  subtitle,
  amount,
  date,
  status,
}: {
  href: string;
  title: string;
  subtitle: string;
  amount: number;
  date: Date | null;
  status: ExpenseStatus;
}) {
  return (
    <Link
      href={href}
      className="block border border-divider p-3 text-inherit no-underline"
    >
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-[family-name:var(--font-heading)] text-sm font-extrabold">
            {title}
          </div>
          <div className="mt-0.5 truncate text-[11px] opacity-55">{subtitle}</div>
        </div>
        <div className="shrink-0 text-right font-[family-name:var(--font-heading)] text-[15px] font-extrabold">
          ฿{formatMoney(amount)}
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <StatusBadge status={status} />
          <AlertMark status={status} />
        </span>
        <span className="shrink-0 text-[11px] opacity-55">{formatThaiDate(date)}</span>
      </div>
    </Link>
  );
}
