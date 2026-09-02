import { z } from "zod";

import { ExpenseItemType } from "@/generated/prisma/enums";

/** Default mileage rate in THB per km, as used throughout the design. */
export const DEFAULT_RATE_PER_KM = 6;

/** Thai labels for each line type, matching the design's wording exactly. */
export const ITEM_TYPE_LABELS: Record<ExpenseItemType, string> = {
  [ExpenseItemType.PERSONAL_VEHICLE]: "พาหนะส่วนบุคคล",
  [ExpenseItemType.PUBLIC_TRANSPORT]: "รถโดยสารสาธารณะ",
  [ExpenseItemType.TOLL]: "ค่าผ่านทางพิเศษ",
};

/** Types that describe a journey, and so carry origin, destination and purpose. */
export function hasRoute(type: ExpenseItemType): boolean {
  return (
    type === ExpenseItemType.PERSONAL_VEHICLE ||
    type === ExpenseItemType.PUBLIC_TRANSPORT
  );
}

/** Only mileage claims derive their amount; the others are entered directly. */
export function isDerivedAmount(type: ExpenseItemType): boolean {
  return type === ExpenseItemType.PERSONAL_VEHICLE;
}

/**
 * Rounds to satang, away from zero on a tie, matching what the UI displays.
 * `+ Number.EPSILON` nudges values such as 8.405 that are a hair below the tie.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The amount a line is worth. Mileage is always recomputed from distance × rate
 * so a client cannot submit a total that contradicts the figures beside it;
 * other types are taken as entered.
 */
export function computeItemAmount(input: {
  type: ExpenseItemType;
  distanceKm?: number | null;
  ratePerKm?: number | null;
  amount?: number | null;
}): number {
  if (isDerivedAmount(input.type)) {
    return roundMoney((input.distanceKm ?? 0) * (input.ratePerKm ?? 0));
  }
  return roundMoney(input.amount ?? 0);
}

const money = z.number().nonnegative().finite();

/**
 * One line's fields, without the completeness rules below.
 *
 * Split out because the two ways of editing a line want different strictness.
 * A web form collects a whole claim and is checked before it is stored; the
 * LINE flow stores what OCR could read and lets the user finish it later, so a
 * half-filled line has to survive being saved. `submitDocument` is the gate
 * either way — nothing incomplete reaches an approver.
 */
export const expenseItemFieldsSchema = z.object({
  type: z.enum(ExpenseItemType),
  /** Calendar date, no time component: "2026-07-28". */
  incurredOn: z.iso.date(),
  origin: z.string().trim().max(200).nullish(),
  destination: z.string().trim().max(200).nullish(),
  purpose: z.string().trim().max(200).nullish(),
  distanceKm: money.max(100_000).nullish(),
  ratePerKm: money.max(1_000).nullish(),
  /** Ignored for mileage lines, which are always derived. */
  amount: money.max(10_000_000).nullish(),
  /** Attachment row backing this line, when a file was uploaded for it. */
  attachmentId: z.string().min(1).nullish(),
});

/** One line as submitted by the client, complete enough to stand on its own. */
export const expenseItemInputSchema = expenseItemFieldsSchema
  .superRefine((item, ctx) => {
    if (isDerivedAmount(item.type)) {
      if (!item.distanceKm) {
        ctx.addIssue({
          code: "custom",
          path: ["distanceKm"],
          message: "กรุณากรอกระยะทาง",
        });
      }
      if (!item.ratePerKm) {
        ctx.addIssue({
          code: "custom",
          path: ["ratePerKm"],
          message: "กรุณากรอกอัตราต่อกิโลเมตร",
        });
      }
      return;
    }

    if (!item.amount) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "กรุณากรอกจำนวนเงิน",
      });
    }
  });

export type ExpenseItemFields = z.infer<typeof expenseItemFieldsSchema>;
export type ExpenseItemInput = z.infer<typeof expenseItemInputSchema>;
