import { formatThaiMonth, thaiMonthShort } from "@/lib/thai";

type ApprovedDoc = {
  decidedAt: Date | null;
  totalAmount: unknown;
  owner: { id: string; name: string | null };
};

export type MonthStats = {
  key: string;
  label: string;
  total: number;
  count: number;
  average: number;
  /** Per-claimant breakdown for the selected month, largest first. */
  rows: { name: string; count: number; amount: number }[];
  /** The selected month plus the five before it, oldest first. */
  trend: { key: string; short: string; label: string; total: number; offset: number }[];
};

const TREND_MONTHS = 6;

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function amountOf(doc: ApprovedDoc): number {
  return Number(doc.totalAmount);
}

/**
 * Summarises what this approver signed off, for the month `offset` months from
 * the current one (0 = this month, negative = earlier).
 *
 * Grouped by the date of the decision rather than the expense: the dashboard
 * answers "what did I approve this month", which is what the running total and
 * the trend bars are measuring.
 */
export function summariseMonth(documents: ApprovedDoc[], offset: number): MonthStats {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const selected = monthKey(base);

  const inMonth = documents.filter(
    (doc) => doc.decidedAt && monthKey(doc.decidedAt) === selected,
  );

  const total = inMonth.reduce((sum, doc) => sum + amountOf(doc), 0);

  const byPerson = new Map<string, { name: string; count: number; amount: number }>();
  for (const doc of inMonth) {
    const key = doc.owner.id;
    const row = byPerson.get(key) ?? { name: doc.owner.name ?? "—", count: 0, amount: 0 };
    row.count += 1;
    row.amount += amountOf(doc);
    byPerson.set(key, row);
  }

  const trend = Array.from({ length: TREND_MONTHS }, (_, index) => {
    const monthsBack = TREND_MONTHS - 1 - index;
    const date = new Date(base.getFullYear(), base.getMonth() - monthsBack, 1);
    const key = monthKey(date);
    const sum = documents
      .filter((doc) => doc.decidedAt && monthKey(doc.decidedAt) === key)
      .reduce((acc, doc) => acc + amountOf(doc), 0);

    return {
      key,
      short: thaiMonthShort(date.getMonth()),
      label: `${formatThaiMonth(date.getFullYear(), date.getMonth())} ฿${sum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      total: sum,
      offset: offset - monthsBack,
    };
  });

  return {
    key: selected,
    label: formatThaiMonth(base.getFullYear(), base.getMonth()),
    total,
    count: inMonth.length,
    average: inMonth.length === 0 ? 0 : total / inMonth.length,
    rows: [...byPerson.values()].sort((a, b) => b.amount - a.amount),
    trend,
  };
}
