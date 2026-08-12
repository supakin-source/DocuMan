import type { Prisma } from "@/generated/prisma/client";

/** Prefix on every DocuMan running number, as shown in the design: CPC-2026-000512. */
export const DOC_NUMBER_PREFIX = "CPC";

const SEQUENCE_DIGITS = 6;

/**
 * Allocates the next running number for `year`.
 *
 * Must be called inside a transaction: the upsert-then-increment is atomic per
 * row, so two concurrent submissions serialise on the sequence row rather than
 * both reading the same value. Passing the transaction client also means a
 * failed submission rolls the number back instead of leaving a gap.
 */
export async function allocateDocNumber(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const sequence = await tx.documentSequence.upsert({
    where: { prefix_year: { prefix: DOC_NUMBER_PREFIX, year } },
    create: { prefix: DOC_NUMBER_PREFIX, year, last: 1 },
    update: { last: { increment: 1 } },
    select: { last: true },
  });

  return formatDocNumber(year, sequence.last);
}

export function formatDocNumber(year: number, sequence: number): string {
  return `${DOC_NUMBER_PREFIX}-${year}-${String(sequence).padStart(SEQUENCE_DIGITS, "0")}`;
}
