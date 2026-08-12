import { ExpenseStatus } from "@/generated/prisma/enums";

export type StatusMeta = {
  label: string;
  /** Inline styles, since the palette mixes tokens with the two status hues. */
  className: string;
  /** Whether the status needs the requester's attention. */
  alert: boolean;
};

/**
 * Presentation for each lifecycle state, with the design's exact Thai wording.
 */
export const STATUS_META: Record<ExpenseStatus, StatusMeta> = {
  [ExpenseStatus.DRAFT]: {
    label: "แบบร่าง",
    className: "border-divider text-text opacity-70",
    alert: false,
  },
  [ExpenseStatus.PENDING]: {
    label: "รออนุมัติ",
    className: "border-status-pending bg-status-pending text-white",
    alert: false,
  },
  [ExpenseStatus.CORRECTION]: {
    label: "ต้องแก้ไข",
    className: "border-accent-500 bg-accent-100 text-accent-700",
    alert: true,
  },
  [ExpenseStatus.REJECTED]: {
    label: "ไม่อนุมัติ",
    className: "border-neutral-400 bg-neutral-300 text-text",
    alert: false,
  },
  [ExpenseStatus.APPROVED]: {
    label: "อนุมัติแล้ว",
    className: "border-status-approved bg-status-approved text-white",
    alert: false,
  },
};
