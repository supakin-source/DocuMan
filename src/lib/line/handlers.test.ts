import "dotenv/config";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppRole } from "@/generated/prisma/enums";
import { chunk, commandFor, helpText } from "@/lib/line/handlers";
import type { LineUser } from "@/lib/line/identity";

/**
 * Nobody types a command. They type a sentence with a command somewhere in it,
 * and the bot has to find it — so these are phrased the way the people using
 * this actually write, not the way the help text lists them.
 */

const PHRASES: [string, ReturnType<typeof commandFor>][] = [
  ["ครบแล้ว", "confirm"],
  ["ส่งครบแล้วครับ", "confirm"],
  ["ส่งรูปครบทุกใบแล้ว", "confirm"],
  ["หมดแล้วครับ", "confirm"],
  ["อ่านเลย", "confirm"],
  ["ส่งอนุมัติ", "submit"],
  ["ส่งอนุมัติเลยครับ", "submit"],
  ["ขออนุมัติหน่อย", "submit"],
  ["สรุป", "summary"],
  ["ขอดูสรุปยอดเดือนนี้หน่อย", "summary"],
  ["ยอดรวมเท่าไหร่", "summary"],
  ["รายการ", "draft"],
  ["ขอดูรายการที่ทำไว้", "draft"],
  ["เริ่มใหม่", "new"],
  ["ขอเริ่มใหม่ครับ", "new"],
  ["ลายเซ็น", "signature"],
  ["อยากแก้ลายเซ็น", "signature"],
  ["ช่วยด้วย", "help"],
  ["help", "help"],
  ["HELP", "help"],
];

describe("commandFor", () => {
  for (const [phrase, expected] of PHRASES) {
    it(`reads "${phrase}" as ${expected}`, () => {
      assert.equal(commandFor(phrase), expected);
    });
  }

  it("prefers the more specific phrase where two overlap", () => {
    // "ส่งอนุมัติ" contains no other command's trigger, but a sentence asking
    // to submit must not be read as a request to look at the list.
    assert.equal(commandFor("ตรวจสอบแล้ว ส่งอนุมัติได้เลย"), "submit");
  });

  it("has nothing to say about a sentence with no command in it", () => {
    assert.equal(commandFor("สวัสดีครับ"), null);
    assert.equal(commandFor("   "), null);
  });
});

describe("helpText", () => {
  const requester: LineUser = {
    id: "u1",
    name: "ณัฐวุฒิ",
    roles: [AppRole.REQUESTER],
    approverId: "u2",
  };

  it("keeps the monthly total out of a requester's help", () => {
    // It is the approver's figure — the sum of everyone's claims they signed
    // off — so offering it to a requester would advertise a command that
    // answers with a refusal.
    assert.ok(!helpText(requester).includes("สรุป"));
  });

  it("offers it to an approver", () => {
    const approver: LineUser = {
      ...requester,
      roles: [AppRole.REQUESTER, AppRole.APPROVER],
    };

    assert.ok(helpText(approver).includes("สรุป"));
  });

  it("tells whoever can send photos that they can confirm a batch", () => {
    // Both roles can receive receipts, so both need to know the word for it.
    assert.ok(helpText(requester).includes("ครบแล้ว"));
  });
});

describe("chunk", () => {
  it("splits into groups no larger than the given size", () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5, 6, 7], 5), [
      [1, 2, 3, 4, 5],
      [6, 7],
    ]);
  });

  it("returns one chunk when everything already fits", () => {
    assert.deepEqual(chunk([1, 2, 3], 5), [[1, 2, 3]]);
  });

  it("returns nothing for nothing", () => {
    assert.deepEqual(chunk([], 5), []);
  });

  it("puts each item in its own chunk when the size is one", () => {
    assert.deepEqual(chunk([1, 2, 3], 1), [[1], [2], [3]]);
  });

  it("lands exactly on a chunk boundary without an empty trailing one", () => {
    assert.deepEqual(chunk([1, 2, 3, 4], 2), [
      [1, 2],
      [3, 4],
    ]);
  });
});
