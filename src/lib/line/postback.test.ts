import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DECISION_REASONS } from "@/lib/domain/decisions";
import {
  decodePostback,
  encodePostback,
  type Postback,
} from "@/lib/line/postback";

/**
 * A postback is the only state a button press carries, and it is written by one
 * deploy and read by the next. Round-tripping every shape is the cheapest proof
 * that a card sent yesterday still means what it said.
 */

const SHAPES: Postback[] = [
  { action: "submit", documentId: "cku1a2b3c4d5e6f7g8h9i0j1k" },
  { action: "discard", documentId: "cku1a2b3c4d5e6f7g8h9i0j1k" },
  { action: "remove", itemId: "cku9z8y7x6w5v4u3t2s1r0q9p" },
  { action: "decide", documentId: "doc-1", verdict: "approve" },
  { action: "decide", documentId: "doc-1", verdict: "return" },
  { action: "decide", documentId: "doc-1", verdict: "reject" },
  { action: "reason", documentId: "doc-1", verdict: "return", reason: "แนบเอกสารไม่ครบ" },
  { action: "reason", documentId: "doc-1", verdict: "reject", reason: "จำนวนเงินไม่ถูกต้อง" },
  { action: "summary", offset: 0 },
  { action: "summary", offset: -5 },
];

describe("postback encoding", () => {
  for (const shape of SHAPES) {
    it(`round-trips ${JSON.stringify(shape)}`, () => {
      assert.deepEqual(decodePostback(encodePostback(shape)), shape);
    });
  }

  it("stays inside LINE's 300-character limit for every shape", () => {
    for (const shape of SHAPES) {
      assert.ok(
        encodePostback(shape).length <= 300,
        `${shape.action} encoded to ${encodePostback(shape).length} characters`,
      );
    }
  });

  it("encodes every decision reason without losing it", () => {
    for (const reason of DECISION_REASONS) {
      const encoded = encodePostback({
        action: "reason",
        documentId: "doc-1",
        verdict: "return",
        reason,
      });

      assert.deepEqual(decodePostback(encoded), {
        action: "reason",
        documentId: "doc-1",
        verdict: "return",
        reason,
      });
    }
  });
});

describe("postback decoding refuses what it does not know", () => {
  const rejected: [string, string][] = [
    ["an action from a future build", "a=refund&doc=doc-1"],
    ["a submit with no document", "a=submit"],
    ["a remove with no item", "a=remove"],
    ["a verdict that is not one of the three", "a=decide&doc=doc-1&v=maybe"],
    ["a reason that is not on the list", "a=reason&doc=doc-1&v=return&r=ไม่ชอบ"],
    ["approve arriving as a reason, which takes none", "a=reason&doc=doc-1&v=approve&r=อื่นๆ"],
    ["a month offset that is not a number", "a=summary&o=soon"],
    ["a month offset far outside the record", "a=summary&o=100000"],
    ["an empty string", ""],
    ["something that is not a query string at all", "just some text"],
  ];

  for (const [description, data] of rejected) {
    it(`rejects ${description}`, () => {
      assert.equal(decodePostback(data), null);
    });
  }
});
