/**
 * Reasons an approver may pick when returning or rejecting a document.
 *
 * Kept in its own module with no server imports: the reason panel is a client
 * component, and reaching into the document service for this list would pull
 * Prisma and the Postgres driver into the browser bundle.
 */
export const DECISION_REASONS = [
  "จำนวนเงินไม่ถูกต้อง",
  "แนบเอกสารไม่ถูกต้อง",
  "แนบเอกสารไม่ครบ",
  "เหตุผลไม่ชัดเจน",
  "อื่นๆ",
] as const;

export type DecisionReason = (typeof DECISION_REASONS)[number];
