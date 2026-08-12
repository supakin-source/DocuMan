import Link from "next/link";

import type { ExpenseStatus } from "@/generated/prisma/enums";
import { STATUS_META } from "@/lib/status";

/**
 * A row of status chips that filter a list through the query string, so the
 * page stays a server component and the choice survives a reload.
 */
export function StatusFilter({
  basePath,
  active,
  options,
  counts,
}: {
  basePath: string;
  active: ExpenseStatus | null;
  options: ExpenseStatus[];
  /** How many documents sit in each status, shown on the chip. */
  counts: Partial<Record<ExpenseStatus, number>>;
}) {
  const total = options.reduce((sum, status) => sum + (counts[status] ?? 0), 0);

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5">
      <Chip href={basePath} label="ทั้งหมด" count={total} active={active === null} />
      {options.map((status) => (
        <Chip
          key={status}
          href={`${basePath}?status=${status}`}
          label={STATUS_META[status].label}
          count={counts[status] ?? 0}
          active={active === status}
        />
      ))}
    </div>
  );
}

function Chip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 border px-3 py-1.5 text-xs whitespace-nowrap no-underline ${
        active
          ? "border-text bg-text text-white"
          : "border-divider bg-transparent text-text"
      }`}
    >
      {label}
      <span className={active ? "opacity-70" : "opacity-45"}> {count}</span>
    </Link>
  );
}
