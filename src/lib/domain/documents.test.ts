import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  AppRole,
  ExpenseItemType,
  ExpenseStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/domain/doc-number";
import {
  createDraft,
  decideDocument,
  getDocumentFor,
  listPendingForApprover,
  saveDocument,
  submitDocument,
  toBytes,
  type SaveDocumentInput,
} from "@/lib/domain/documents";
import {
  ForbiddenError,
  InvalidStateError,
  ValidationError,
} from "@/lib/domain/errors";

const SIGNATURE = toBytes(new Uint8Array([137, 80, 78, 71]));

let requester: { id: string };
let approver: { id: string };
let outsider: { id: string };

async function wipe() {
  // ExpenseDocument cascades to items, attachments and timeline.
  await prisma.expenseDocument.deleteMany();
  await prisma.documentSequence.deleteMany();
  await prisma.user.deleteMany();
}

const validInput: SaveDocumentInput = {
  project: "CC-4102 · ฝ่ายขาย",
  description: "เดินทางไปพบลูกค้า",
  reason: "ผู้ขับไม่ออกใบเสร็จ",
  paymentType: "CASH",
  includeCertificate: true,
  items: [
    {
      type: ExpenseItemType.PERSONAL_VEHICLE,
      incurredOn: "2026-07-28",
      origin: "สำนักงานใหญ่ ถ.สาทร",
      destination: "ลูกค้า ถ.สุขุมวิท",
      purpose: "ไปปฏิบัติงาน",
      distanceKm: 14,
      ratePerKm: 6,
    },
    {
      type: ExpenseItemType.TOLL,
      incurredOn: "2026-07-28",
      amount: 75,
    },
  ],
};

before(async () => {
  await wipe();
});

beforeEach(async () => {
  await wipe();

  approver = await prisma.user.create({
    data: {
      email: "boss@assetfive.co.th",
      name: "สุพจน์ วงศ์เจริญ",
      roles: [AppRole.APPROVER],
    },
    select: { id: true },
  });

  requester = await prisma.user.create({
    data: {
      email: "staff@assetfive.co.th",
      name: "ณัฐวุฒิ ศรีสุข",
      roles: [AppRole.REQUESTER, AppRole.APPROVER],
      employeeCode: "EMP-10234",
      position: "เจ้าหน้าที่ขายอาวุโส",
      approverId: approver.id,
    },
    select: { id: true },
  });

  outsider = await prisma.user.create({
    data: {
      email: "other@assetfive.co.th",
      name: "ปิยะดา รักเรียน",
      roles: [AppRole.REQUESTER],
    },
    select: { id: true },
  });
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

async function draftFor(userId = requester.id, input = validInput) {
  const id = await createDraft(userId);
  await saveDocument(id, userId, input);
  return id;
}

describe("saveDocument", () => {
  it("derives mileage amounts and totals them", async () => {
    const id = await draftFor();
    const doc = await getDocumentFor(id, requester.id);

    // 14 km × ฿6 = ฿84, plus the ฿75 toll.
    assert.equal(Number(doc.items[0].amount), 84);
    assert.equal(Number(doc.items[1].amount), 75);
    assert.equal(Number(doc.totalAmount), 159);
  });

  it("ignores a client-supplied amount on a mileage line", async () => {
    const id = await draftFor(requester.id, {
      ...validInput,
      items: [{ ...validInput.items[0], amount: 99_999 }],
    });
    const doc = await getDocumentFor(id, requester.id);

    assert.equal(Number(doc.items[0].amount), 84);
  });

  it("stores the date the user picked, without a time-zone shift", async () => {
    const id = await draftFor();
    const doc = await getDocumentFor(id, requester.id);

    assert.equal(doc.items[0].incurredOn.toISOString().slice(0, 10), "2026-07-28");
  });

  it("replaces the previous lines rather than appending", async () => {
    const id = await draftFor();
    await saveDocument(id, requester.id, {
      ...validInput,
      items: [validInput.items[1]],
    });
    const doc = await getDocumentFor(id, requester.id);

    assert.equal(doc.items.length, 1);
    assert.equal(Number(doc.totalAmount), 75);
  });

  it("refuses to edit someone else's document", async () => {
    const id = await draftFor();
    await assert.rejects(
      () => saveDocument(id, outsider.id, validInput),
      ForbiddenError,
    );
  });

  it("refuses to edit a document that is awaiting a decision", async () => {
    const id = await draftFor();
    await submitDocument(id, requester.id, SIGNATURE);

    await assert.rejects(
      () => saveDocument(id, requester.id, validInput),
      InvalidStateError,
    );
  });
});

describe("submitDocument", () => {
  it("allocates sequential running numbers within a year", async () => {
    const first = await draftFor();
    const second = await draftFor();

    const a = await submitDocument(first, requester.id, SIGNATURE);
    const b = await submitDocument(second, requester.id, SIGNATURE);

    const year = new Date().getFullYear();
    assert.equal(a.docNo, formatDocNumber(year, 1));
    assert.equal(b.docNo, formatDocNumber(year, 2));
  });

  it("moves the document to PENDING and records the signature", async () => {
    const id = await draftFor();
    const doc = await submitDocument(id, requester.id, SIGNATURE);

    assert.equal(doc.status, ExpenseStatus.PENDING);
    assert.deepEqual(Array.from(doc.requesterSignature ?? []), Array.from(SIGNATURE));
    assert.ok(doc.submittedAt);
    assert.deepEqual(
      doc.timeline.map((event) => event.action),
      ["SUBMITTED"],
    );
  });

  it("rejects an empty signature", async () => {
    const id = await draftFor();
    await assert.rejects(
      () => submitDocument(id, requester.id, toBytes(new Uint8Array())),
      ValidationError,
    );
  });

  it("refuses to submit when no approver is assigned", async () => {
    const id = await draftFor(outsider.id);
    await assert.rejects(
      () => submitDocument(id, outsider.id, SIGNATURE),
      InvalidStateError,
    );
  });
});

describe("decideDocument", () => {
  async function pending() {
    const id = await draftFor();
    await submitDocument(id, requester.id, SIGNATURE);
    return id;
  }

  it("approves, storing the approver's mark and clearing any reason", async () => {
    const id = await pending();
    const doc = await decideDocument(id, approver.id, {
      decision: "approve",
      comment: "ตรวจสอบแล้ว",
      signature: SIGNATURE,
    });

    assert.equal(doc.status, ExpenseStatus.APPROVED);
    assert.equal(doc.decidedById, approver.id);
    assert.equal(doc.decisionReason, null);
    assert.ok(doc.approverSignature);
    assert.equal(doc.timeline.at(-1)?.action, "APPROVED");
  });

  it("will not approve without a signature", async () => {
    const id = await pending();
    await assert.rejects(
      () => decideDocument(id, approver.id, { decision: "approve" }),
      ValidationError,
    );
  });

  it("will not return or reject without a reason", async () => {
    const id = await pending();
    await assert.rejects(
      () => decideDocument(id, approver.id, { decision: "return" }),
      ValidationError,
    );
  });

  it("refuses a document the approver owns, even holding the approver role", async () => {
    // The requester also holds APPROVER; nobody signs off their own claim.
    await prisma.user.update({
      where: { id: requester.id },
      data: { approverId: requester.id },
    });
    const id = await pending();

    await assert.rejects(
      () =>
        decideDocument(id, requester.id, {
          decision: "approve",
          signature: SIGNATURE,
        }),
      ForbiddenError,
    );
  });

  it("refuses an approver the requester does not report to", async () => {
    const id = await pending();
    await assert.rejects(
      () =>
        decideDocument(id, outsider.id, {
          decision: "approve",
          signature: SIGNATURE,
        }),
      ForbiddenError,
    );
  });

  it("refuses to decide twice", async () => {
    const id = await pending();
    await decideDocument(id, approver.id, {
      decision: "approve",
      signature: SIGNATURE,
    });

    await assert.rejects(
      () =>
        decideDocument(id, approver.id, {
          decision: "reject",
          reason: "จำนวนเงินไม่ถูกต้อง",
        }),
      InvalidStateError,
    );
  });
});

describe("correction round trip", () => {
  it("keeps the running number and clears the stale verdict on resubmit", async () => {
    const id = await draftFor();
    const submitted = await submitDocument(id, requester.id, SIGNATURE);

    await decideDocument(id, approver.id, {
      decision: "return",
      reason: "แนบเอกสารไม่ครบ",
    });

    const returned = await getDocumentFor(id, requester.id);
    assert.equal(returned.status, ExpenseStatus.CORRECTION);
    assert.equal(returned.decisionReason, "แนบเอกสารไม่ครบ");

    // A returned document is editable again.
    await saveDocument(id, requester.id, validInput);
    const resubmitted = await submitDocument(id, requester.id, SIGNATURE);

    assert.equal(resubmitted.status, ExpenseStatus.PENDING);
    assert.equal(resubmitted.docNo, submitted.docNo);
    assert.equal(resubmitted.decisionReason, null);
    assert.equal(resubmitted.decidedById, null);
    assert.deepEqual(
      resubmitted.timeline.map((event) => event.action),
      ["SUBMITTED", "RETURNED", "RESUBMITTED"],
    );
  });
});

describe("visibility", () => {
  it("lets the assigned approver read a submitted document", async () => {
    const id = await draftFor();
    await submitDocument(id, requester.id, SIGNATURE);

    const doc = await getDocumentFor(id, approver.id);
    assert.equal(doc.id, id);
  });

  it("hides it from everyone else", async () => {
    const id = await draftFor();
    await submitDocument(id, requester.id, SIGNATURE);

    await assert.rejects(() => getDocumentFor(id, outsider.id), ForbiddenError);
  });

  it("lists only documents from the approver's own reports", async () => {
    const mine = await draftFor();
    await submitDocument(mine, requester.id, SIGNATURE);

    // Someone who reports to nobody in particular.
    await prisma.user.update({
      where: { id: outsider.id },
      data: { approverId: outsider.id },
    });
    const theirs = await draftFor(outsider.id);
    await submitDocument(theirs, outsider.id, SIGNATURE);

    const queue = await listPendingForApprover(approver.id);
    assert.deepEqual(
      queue.map((doc) => doc.id),
      [mine],
    );
  });
});
