import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ExpenseItemType } from "@/generated/prisma/enums";
import { summariseMonth } from "@/lib/domain/stats";
import type { DraftLine, DraftState } from "@/lib/line/claim";
import {
  approvalRequestCard,
  draftCard,
  monthSummaryCard,
  reasonPicker,
  receiptCard,
} from "@/lib/line/flex";
import { decodePostback } from "@/lib/line/postback";

/**
 * A Flex bubble is JSON with no type checking on the far side: LINE renders
 * what it understands and silently drops what it does not. The two things worth
 * asserting are therefore the ones a person would only discover by tapping —
 * that every button's payload decodes, and that every bubble carries the
 * alt text a notification is built from.
 */

const complete: DraftLine = {
  id: "item-1",
  type: ExpenseItemType.PERSONAL_VEHICLE,
  incurredOn: new Date("2026-07-28T00:00:00.000Z"),
  origin: "สำนักงานใหญ่",
  destination: "ลูกค้า",
  distanceKm: 14,
  ratePerKm: 6,
  amount: 84,
  missing: [],
};

const incomplete: DraftLine = {
  ...complete,
  id: "item-2",
  type: ExpenseItemType.PUBLIC_TRANSPORT,
  distanceKm: null,
  ratePerKm: null,
  amount: 0,
  missing: ["จำนวนเงิน"],
};

const state: DraftState = {
  documentId: "doc-1",
  status: "DRAFT",
  docNo: null,
  decisionReason: null,
  lines: [complete, incomplete],
  total: 84,
  complete: false,
};

/** Every `action` object anywhere in a bubble, however deeply nested. */
function actionsIn(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(actionsIn);
  if (typeof node !== "object" || node === null) return [];

  const record = node as Record<string, unknown>;
  const own =
    typeof record.action === "object" && record.action !== null
      ? [record.action as Record<string, unknown>]
      : [];

  return [...own, ...Object.values(record).flatMap(actionsIn)];
}

function postbackData(message: Record<string, unknown>): string[] {
  return actionsIn(message)
    .filter((action) => action.type === "postback")
    .map((action) => String(action.data));
}

const CARDS: [string, Record<string, unknown>][] = [
  ["receiptCard, complete line", receiptCard(complete, state)],
  ["receiptCard, incomplete line", receiptCard(incomplete, state)],
  ["draftCard", draftCard(state)],
  ["draftCard, nothing added yet", draftCard({ ...state, lines: [], total: 0 })],
  [
    "approvalRequestCard",
    approvalRequestCard({
      documentId: "doc-1",
      docNo: "CPC-2026-000512",
      requesterName: "ณัฐวุฒิ ศรีสุข",
      itemCount: 2,
      total: 159,
    }),
  ],
  ["reasonPicker, return", reasonPicker("doc-1", "return")],
  ["reasonPicker, reject", reasonPicker("doc-1", "reject")],
  ["monthSummaryCard, current month", monthSummaryCard(summariseMonth([], 0), 0)],
  ["monthSummaryCard, an earlier month", monthSummaryCard(summariseMonth([], -3), -3)],
];

describe("Flex cards", () => {
  for (const [name, card] of CARDS) {
    it(`${name} carries alt text for the notification`, () => {
      assert.equal(card.type, "flex");
      assert.ok(typeof card.altText === "string" && card.altText.length > 0);
      // LINE truncates alt text at 400 characters.
      assert.ok(String(card.altText).length <= 400);
    });

    it(`${name} has no button the webhook cannot read back`, () => {
      for (const data of postbackData(card)) {
        assert.notEqual(decodePostback(data), null, `undecodable postback: ${data}`);
      }
    });
  }

  it("offers the requester both ways out of a receipt card", () => {
    const actions = postbackData(receiptCard(complete, state))
      .map(decodePostback)
      .map((postback) => postback?.action);

    assert.deepEqual(actions.sort(), ["remove", "submit"]);
  });

  it("offers the approver all three verdicts", () => {
    const verdicts = postbackData(
      approvalRequestCard({
        documentId: "doc-1",
        docNo: "CPC-2026-000512",
        requesterName: "ณัฐวุฒิ ศรีสุข",
        itemCount: 2,
        total: 159,
      }),
    )
      .map(decodePostback)
      .map((postback) => (postback?.action === "decide" ? postback.verdict : null));

    assert.deepEqual(verdicts.sort(), ["approve", "reject", "return"]);
  });

  it("does not page past the current month", () => {
    const offsets = postbackData(monthSummaryCard(summariseMonth([], 0), 0))
      .map(decodePostback)
      .map((postback) => (postback?.action === "summary" ? postback.offset : null));

    assert.deepEqual(offsets, [-1]);
  });

  it("pages both ways once the month is in the past", () => {
    const offsets = postbackData(monthSummaryCard(summariseMonth([], -3), -3))
      .map(decodePostback)
      .map((postback) => (postback?.action === "summary" ? postback.offset : null));

    assert.deepEqual(offsets, [-4, -2]);
  });
});
