import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMoney, formatThaiDate, formatThaiMonth, thaiBahtText } from "@/lib/thai";

describe("formatThaiDate", () => {
  it("renders day, short month and Buddhist Era year", () => {
    assert.equal(formatThaiDate(new Date("2026-07-28")), "28 ก.ค. 2569");
    assert.equal(formatThaiDate(new Date("2026-01-01")), "1 ม.ค. 2569");
    assert.equal(formatThaiDate(new Date("2026-12-31")), "31 ธ.ค. 2569");
  });

  it("does not shift the day across time zones", () => {
    // Stored as a SQL date, so midnight UTC must stay the 1st, not roll back.
    assert.equal(formatThaiDate(new Date("2026-08-01T00:00:00.000Z")), "1 ส.ค. 2569");
  });

  it("returns an empty string for a missing date", () => {
    assert.equal(formatThaiDate(null), "");
    assert.equal(formatThaiDate(undefined), "");
  });
});

describe("formatThaiMonth", () => {
  it("renders the full month name with the BE year", () => {
    assert.equal(formatThaiMonth(2026, 7), "สิงหาคม 2569");
  });
});

describe("formatMoney", () => {
  it("always shows two decimals with thousands separators", () => {
    assert.equal(formatMoney(1860), "1,860.00");
    assert.equal(formatMoney(0), "0.00");
    assert.equal(formatMoney(84.5), "84.50");
    assert.equal(formatMoney(1234567.891), "1,234,567.89");
  });
});

describe("thaiBahtText", () => {
  it("spells whole amounts with ถ้วน", () => {
    assert.equal(thaiBahtText(0), "ศูนย์บาทถ้วน");
    assert.equal(thaiBahtText(1), "หนึ่งบาทถ้วน");
    assert.equal(thaiBahtText(1860), "หนึ่งพันแปดร้อยหกสิบบาทถ้วน");
    assert.equal(thaiBahtText(3200), "สามพันสองร้อยบาทถ้วน");
  });

  it("applies the เอ็ด / ยี่สิบ / สิบ irregularities", () => {
    assert.equal(thaiBahtText(11), "สิบเอ็ดบาทถ้วน");
    assert.equal(thaiBahtText(20), "ยี่สิบบาทถ้วน");
    assert.equal(thaiBahtText(21), "ยี่สิบเอ็ดบาทถ้วน");
    assert.equal(thaiBahtText(10), "สิบบาทถ้วน");
    assert.equal(thaiBahtText(101), "หนึ่งร้อยเอ็ดบาทถ้วน");
  });

  it("repeats groups of six digits with ล้าน", () => {
    assert.equal(thaiBahtText(1_000_000), "หนึ่งล้านบาทถ้วน");
    assert.equal(thaiBahtText(1_000_001), "หนึ่งล้านหนึ่งบาทถ้วน");
  });

  it("spells satang instead of dropping them", () => {
    assert.equal(thaiBahtText(159.5), "หนึ่งร้อยห้าสิบเก้าบาทห้าสิบสตางค์");
    assert.equal(thaiBahtText(0.25), "ศูนย์บาทยี่สิบห้าสตางค์");
    assert.equal(thaiBahtText(84.01), "แปดสิบสี่บาทหนึ่งสตางค์");
  });

  it("rounds satang so the words match the printed figure", () => {
    // 0.29 is 0.28999... in binary; truncating would spell twenty-eight satang
    // next to a printed 0.29.
    assert.equal(thaiBahtText(0.29), "ศูนย์บาทยี่สิบเก้าสตางค์");

    // The invariant that matters: the words never contradict the figure beside
    // them. 1.005 is 1.00499... as a double, so both settle on one baht even.
    for (const amount of [0.29, 1.005, 84.005, 2.675, 159.5, 1860]) {
      const figure = formatMoney(amount);
      const satangFromFigure = Number(figure.split(".")[1]);
      const words = thaiBahtText(amount);
      if (satangFromFigure === 0) {
        assert.ok(
          words.endsWith("บาทถ้วน"),
          `${figure} should read as a whole number of baht, got ${words}`,
        );
      } else {
        assert.ok(
          words.endsWith("สตางค์"),
          `${figure} should spell satang, got ${words}`,
        );
      }
    }
  });

  it("accepts the comma-formatted strings the UI holds", () => {
    assert.equal(thaiBahtText("1,860.00"), "หนึ่งพันแปดร้อยหกสิบบาทถ้วน");
  });

  it("falls back to zero for unparseable input", () => {
    assert.equal(thaiBahtText("ไม่ใช่ตัวเลข"), "ศูนย์บาทถ้วน");
  });

  it("marks negative amounts", () => {
    assert.equal(thaiBahtText(-50), "ลบห้าสิบบาทถ้วน");
  });
});
