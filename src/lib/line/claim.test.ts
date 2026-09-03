import "dotenv/config";

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";

/**
 * `serverEnv()`/`lineEnv()` cache on first call, and this file is the first to
 * reach the code that needs them — `receiveReceipt` calls LINE's content
 * endpoint, `processPendingReceipts` calls Gemini. `??=` so a real value set
 * elsewhere (or by an earlier-loaded test file) is never clobbered.
 */
process.env.AUTH_SECRET ??= "test-auth-secret";
process.env.AUTH_GOOGLE_ID ??= "x";
process.env.AUTH_GOOGLE_SECRET ??= "x";
process.env.GOOGLE_GENAI_API_KEY ??= "x";
process.env.LINE_CHANNEL_SECRET ??= "test-channel-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ??= "test-access-token";

import { AppRole, ExpenseItemType, ExpenseStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { appendItem, createDraft, decideDocument, submitDocument, toBytes } from "@/lib/domain/documents";
import { ValidationError } from "@/lib/domain/errors";
import {
  countPendingReceipts,
  currentDocumentId,
  processPendingReceipts,
  readDraft,
  receiveReceipt,
  startNewDraft,
  submitClaim,
} from "@/lib/line/claim";

const SIGNATURE = toBytes(new Uint8Array([137, 80, 78, 71]));

let requester: { id: string };
let approver: { id: string };

async function wipe() {
  await prisma.expenseDocument.deleteMany();
  await prisma.documentSequence.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(async () => {
  await wipe();

  approver = await prisma.user.create({
    data: {
      email: "boss@assetfive.co.th",
      name: "สุพจน์ วงศ์เจริญ",
      roles: [AppRole.APPROVER],
      lineUserId: "Uapprover0000000000000000000000",
      signature: SIGNATURE,
    },
    select: { id: true },
  });

  requester = await prisma.user.create({
    data: {
      email: "staff@assetfive.co.th",
      name: "ณัฐวุฒิ ศรีสุข",
      roles: [AppRole.REQUESTER],
      lineUserId: "Urequester000000000000000000000",
      signature: SIGNATURE,
      approverId: approver.id,
    },
    select: { id: true },
  });
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

async function addToll(documentId: string, amount: number) {
  return appendItem(documentId, requester.id, {
    type: ExpenseItemType.TOLL,
    incurredOn: "2026-07-29",
    amount,
  });
}

describe("currentDocumentId", () => {
  it("creates a claim when there is none to add to", async () => {
    const id = await currentDocumentId(requester.id);
    const document = await prisma.expenseDocument.findUniqueOrThrow({
      where: { id },
      select: { ownerId: true, status: true },
    });

    assert.equal(document.ownerId, requester.id);
    assert.equal(document.status, ExpenseStatus.DRAFT);
  });

  it("returns the same claim on the next receipt rather than a new one", async () => {
    const first = await currentDocumentId(requester.id);
    await addToll(first, 40);

    assert.equal(await currentDocumentId(requester.id), first);
  });

  it("never hands one person another person's claim", async () => {
    const theirs = await createDraft(approver.id);
    const mine = await currentDocumentId(requester.id);

    assert.notEqual(mine, theirs);
  });

  it("picks up a returned document, which is what the next receipt is for", async () => {
    const id = await currentDocumentId(requester.id);
    await addToll(id, 40);
    await submitDocument(id, requester.id, SIGNATURE);
    await decideDocument(id, approver.id, {
      decision: "return",
      reason: "แนบเอกสารไม่ครบ",
    });

    // A draft started before the return exists too; the returned document is
    // the more recently touched of the two, and is the one being asked about.
    assert.equal(await currentDocumentId(requester.id), id);
  });

  it("moves on to a fresh claim once one is explicitly started", async () => {
    const first = await currentDocumentId(requester.id);
    const second = await startNewDraft(requester.id);

    assert.notEqual(second, first);
    assert.equal(await currentDocumentId(requester.id), second);
  });
});

describe("readDraft", () => {
  it("names the fields a line is still missing", async () => {
    const id = await currentDocumentId(requester.id);

    // What OCR leaves behind when it cannot read the fare off a crumpled
    // ticket: a line that exists, with a hole in it.
    await appendItem(id, requester.id, {
      type: ExpenseItemType.PUBLIC_TRANSPORT,
      incurredOn: "2026-07-29",
      origin: "สำนักงานใหญ่",
      destination: null,
      amount: 0,
    });

    const state = await readDraft(id);

    assert.deepEqual(state?.lines[0].missing, ["จำนวนเงิน", "ปลายทาง"]);
    assert.equal(state?.complete, false);
  });

  it("asks a mileage line for distance, not for an amount", async () => {
    const id = await currentDocumentId(requester.id);
    await appendItem(id, requester.id, {
      type: ExpenseItemType.PERSONAL_VEHICLE,
      incurredOn: "2026-07-29",
      origin: "สำนักงานใหญ่",
      destination: "ลูกค้า",
      ratePerKm: 6,
      distanceKm: null,
      amount: 0,
    });

    assert.deepEqual((await readDraft(id))?.lines[0].missing, ["ระยะทาง"]);
  });

  it("asks a toll for nothing but its amount", async () => {
    const id = await currentDocumentId(requester.id);
    await addToll(id, 40);

    const state = await readDraft(id);
    assert.deepEqual(state?.lines[0].missing, []);
    assert.equal(state?.complete, true);
  });

  it("is not complete while it is empty", async () => {
    const id = await currentDocumentId(requester.id);
    const state = await readDraft(id);

    assert.equal(state?.lines.length, 0);
    assert.equal(state?.complete, false);
  });

  it("totals the lines it reports", async () => {
    const id = await currentDocumentId(requester.id);
    await addToll(id, 40);
    await addToll(id, 35);

    assert.equal((await readDraft(id))?.total, 75);
  });
});

describe("submitClaim", () => {
  it("signs with the stored signature and points at the approver's LINE", async () => {
    const id = await currentDocumentId(requester.id);
    await addToll(id, 40);

    const result = await submitClaim(requester.id, id);

    assert.ok(result.docNo);
    assert.equal(result.total, 40);
    assert.equal(result.approverLineUserId, "Uapprover0000000000000000000000");

    const document = await prisma.expenseDocument.findUniqueOrThrow({
      where: { id },
      select: { status: true, requesterSignature: true },
    });
    assert.equal(document.status, ExpenseStatus.PENDING);
    assert.deepEqual(
      Array.from(document.requesterSignature ?? []),
      Array.from(SIGNATURE),
    );
  });

  it("asks for a signature before anything else when none is stored", async () => {
    await prisma.user.update({
      where: { id: requester.id },
      data: { signature: null },
    });

    const id = await currentDocumentId(requester.id);
    await addToll(id, 40);

    await assert.rejects(
      () => submitClaim(requester.id, id),
      (error: unknown) =>
        error instanceof ValidationError && error.message === "SIGNATURE_REQUIRED",
    );
  });

  it("reports an approver who has not linked LINE, rather than failing", async () => {
    await prisma.user.update({
      where: { id: approver.id },
      data: { lineUserId: null },
    });

    const id = await currentDocumentId(requester.id);
    await addToll(id, 40);

    const result = await submitClaim(requester.id, id);

    // The claim is submitted either way — it is in the approver's queue. Only
    // the notification is unavailable, and the caller says so in words.
    assert.equal(result.approverLineUserId, null);
    assert.equal(result.approverName, "สุพจน์ วงศ์เจริญ");
  });

  it("refuses a claim with an incomplete line", async () => {
    const id = await currentDocumentId(requester.id);
    await appendItem(id, requester.id, {
      type: ExpenseItemType.PUBLIC_TRANSPORT,
      incurredOn: "2026-07-29",
      amount: 0,
    });

    await assert.rejects(() => submitClaim(requester.id, id), ValidationError);
  });
});

// ─── Reading a burst of photos together ───────────────────────────────────

const realFetch = globalThis.fetch;

/**
 * Stands in for both external calls a receipt goes through: LINE's content
 * endpoint (the photo bytes) and Gemini's generateContent (what it read).
 * Recognised by host, since that is the only thing distinguishing the two.
 */
function stubExternalCalls(extractions: Record<string, unknown>[]) {
  let call = 0;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);

    if (url.includes("api-data.line.me")) {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    }

    if (url.includes("generativelanguage.googleapis.com")) {
      const extraction = extractions[Math.min(call, extractions.length - 1)];
      call += 1;

      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(extraction) }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const MAP_SCREENSHOT = {
  kind: "personal_vehicle",
  date: "2026-07-28",
  origin: "สำนักงานใหญ่",
  destination: "ลูกค้า",
  distanceKm: 12,
  amount: null,
};

const TOLL_SLIP = {
  kind: "toll",
  date: "2026-07-28",
  origin: null,
  destination: null,
  distanceKm: null,
  amount: 75,
};

describe("receiveReceipt", () => {
  it("stores the photo without reading it", async () => {
    stubExternalCalls([MAP_SCREENSHOT]);

    const { documentId, pendingCount } = await receiveReceipt({
      userId: requester.id,
      messageId: "m1",
    });

    assert.equal(pendingCount, 1);

    const state = await readDraft(documentId);
    // Nothing was read, so there is no line yet — only the file behind one.
    assert.equal(state?.lines.length, 0);
  });

  it("counts every photo still waiting, across several", async () => {
    stubExternalCalls([MAP_SCREENSHOT]);

    const first = await receiveReceipt({ userId: requester.id, messageId: "m1" });
    const second = await receiveReceipt({ userId: requester.id, messageId: "m2" });

    assert.equal(first.pendingCount, 1);
    assert.equal(second.pendingCount, 2);
    assert.equal(await countPendingReceipts(first.documentId), 2);
  });
});

describe("processPendingReceipts", () => {
  it("turns every waiting photo into a line, in the order received", async () => {
    stubExternalCalls([MAP_SCREENSHOT, TOLL_SLIP]);

    const { documentId } = await receiveReceipt({ userId: requester.id, messageId: "m1" });
    await receiveReceipt({ userId: requester.id, messageId: "m2" });

    const { newLines, state } = await processPendingReceipts(requester.id, documentId);

    assert.equal(newLines.length, 2);
    assert.equal(newLines[0].type, ExpenseItemType.PERSONAL_VEHICLE);
    assert.equal(newLines[1].type, ExpenseItemType.TOLL);
    assert.equal(state.lines.length, 2);
    // 12 km × the default rate (฿6) = ฿72, plus the ฿75 toll.
    assert.equal(state.total, 147);
  });

  it("leaves nothing pending once everything has been read", async () => {
    stubExternalCalls([MAP_SCREENSHOT]);
    const { documentId } = await receiveReceipt({ userId: requester.id, messageId: "m1" });

    await processPendingReceipts(requester.id, documentId);

    assert.equal(await countPendingReceipts(documentId), 0);
  });

  it("does nothing, and reports nothing, when there is no photo waiting", async () => {
    const documentId = await currentDocumentId(requester.id);

    const { newLines, state } = await processPendingReceipts(requester.id, documentId);

    assert.equal(newLines.length, 0);
    assert.equal(state.lines.length, 0);
  });

  it("running it twice does not read the same photo again", async () => {
    stubExternalCalls([MAP_SCREENSHOT]);
    const { documentId } = await receiveReceipt({ userId: requester.id, messageId: "m1" });

    const once = await processPendingReceipts(requester.id, documentId);
    const twice = await processPendingReceipts(requester.id, documentId);

    assert.equal(once.newLines.length, 1);
    assert.equal(twice.newLines.length, 0);
    assert.equal(twice.state.lines.length, 1);
  });

  it("still creates a blank line for a photo OCR could not read", async () => {
    // A model failure must not lose the photo the user already sent — it
    // becomes a line with a hole in it, same as an "unknown" document kind.
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("api-data.line.me")) {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 });
      }
      return new Response("server error", { status: 500 });
    }) as typeof fetch;

    const { documentId } = await receiveReceipt({ userId: requester.id, messageId: "m1" });
    const { newLines } = await processPendingReceipts(requester.id, documentId);

    assert.equal(newLines.length, 1);
    assert.deepEqual(newLines[0].missing.sort(), ["จำนวนเงิน", "ต้นทาง", "ปลายทาง"].sort());
  });
});
