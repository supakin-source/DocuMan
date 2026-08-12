import type { ExpenseStatus } from "@/generated/prisma/enums";
import { STATUS_META } from "@/lib/status";

export function StatusBadge({ status }: { status: ExpenseStatus }) {
  const meta = STATUS_META[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-extrabold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

/** The circled "!" the design puts beside a document needing correction. */
export function AlertMark({ status }: { status: ExpenseStatus }) {
  if (!STATUS_META[status].alert) return null;

  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-accent-700"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
