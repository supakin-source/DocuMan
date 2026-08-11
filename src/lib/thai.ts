/**
 * Thai formatting helpers for text that prints on documents of record.
 */

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
] as const;

const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

/** Offset from the Gregorian year to the Buddhist Era year used in Thailand. */
const BE_OFFSET = 543;

/**
 * "28 ก.ค. 2569" — day, abbreviated month, Buddhist Era year.
 *
 * Dates are read in UTC because expense dates are stored as SQL `date` (no time
 * zone); reading them locally would shift the day for negative offsets.
 */
export function formatThaiDate(date: Date | null | undefined): string {
  if (!date) return "";
  return `${date.getUTCDate()} ${THAI_MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear() + BE_OFFSET}`;
}

/** "สิงหาคม 2569" — used for the approver dashboard's month selector. */
export function formatThaiMonth(year: number, monthIndex: number): string {
  return `${THAI_MONTHS_FULL[monthIndex]} ${year + BE_OFFSET}`;
}

/** "ส.ค." — used for the trend chart's axis labels. */
export function thaiMonthShort(monthIndex: number): string {
  return THAI_MONTHS_SHORT[monthIndex];
}

/** Thousands-separated with exactly two decimals: 1860 → "1,860.00". */
export function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const DIGIT_WORDS = [
  "ศูนย์",
  "หนึ่ง",
  "สอง",
  "สาม",
  "สี่",
  "ห้า",
  "หก",
  "เจ็ด",
  "แปด",
  "เก้า",
] as const;

const POSITION_WORDS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"] as const;

/**
 * Spells one group of up to six digits (0–999,999), applying the standard
 * irregularities: a trailing 1 alongside a higher digit is "เอ็ด" rather than
 * "หนึ่ง", 2 in the tens place is "ยี่สิบ", and 1 in the tens place is bare "สิบ".
 *
 * "เอ็ด" is decided per group, not across the whole number: the lone 1 in
 * 1,000,000 heads its own group and stays "หนึ่ง".
 */
function spellGroup(group: number): string {
  const digits = String(group);
  let out = "";

  for (let i = 0; i < digits.length; i++) {
    const digit = Number(digits[i]);
    if (digit === 0) continue;

    const position = digits.length - 1 - i;

    if (position === 0 && digit === 1 && digits.length > 1) out += "เอ็ด";
    else if (position === 1 && digit === 2) out += `ยี่${POSITION_WORDS[1]}`;
    else if (position === 1 && digit === 1) out += POSITION_WORDS[1];
    else out += DIGIT_WORDS[digit] + POSITION_WORDS[position];
  }

  return out;
}

/**
 * Spells a whole number in Thai. Six-digit groups are joined with "ล้าน", which
 * repeats for each boundary — so 10^12 reads "หนึ่งล้านล้าน".
 */
function spellInteger(value: number): string {
  if (value === 0) return DIGIT_WORDS[0];

  const groups: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 1_000_000)) {
    groups.unshift(rest % 1_000_000);
  }

  let out = "";
  groups.forEach((group, i) => {
    if (i > 0) out += "ล้าน";
    if (group !== 0) out += spellGroup(group);
  });

  return out;
}

/**
 * Spells an amount of money in Thai, as required on ใบรับรองแทนใบเสร็จรับเงิน.
 *
 *   1860    → "หนึ่งพันแปดร้อยหกสิบบาทถ้วน"
 *   159.50  → "หนึ่งร้อยห้าสิบเก้าบาทห้าสิบสตางค์"
 *
 * The baht and satang are read back out of formatMoney's output rather than
 * recomputed, so the words cannot disagree with the figure printed beside them.
 * Rounding the amount independently would: `Math.round(1.005 * 100)` is 100,
 * because 1.005 is really 1.00499…, while Intl rounds the same input to "1.01".
 */
export function thaiBahtText(amount: number | string): string {
  const numeric =
    typeof amount === "number"
      ? amount
      : Number.parseFloat(String(amount).replace(/,/g, ""));

  if (!Number.isFinite(numeric)) return "ศูนย์บาทถ้วน";

  const negative = numeric < 0;
  const [bahtDigits, satangDigits] = formatMoney(Math.abs(numeric))
    .replace(/,/g, "")
    .split(".");
  const baht = Number(bahtDigits);
  const satang = Number(satangDigits);

  const bahtPart = `${spellInteger(baht)}บาท`;
  const satangPart = satang === 0 ? "ถ้วน" : `${spellInteger(satang)}สตางค์`;

  return `${negative ? "ลบ" : ""}${bahtPart}${satangPart}`;
}
