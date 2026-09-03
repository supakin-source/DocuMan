import "dotenv/config";

import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { AppRole, ExpenseItemType, ExpenseStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { appendItem, createDraft, decideDocument, submitDocument, toBytes } from "@/lib/domain/documents";
import { ValidationError } from "@/lib/domain/errors";
import {
  currentDocumentId,
  readDraft,
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
