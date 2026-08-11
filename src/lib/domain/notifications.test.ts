import "dotenv/config";

import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { AppRole, ExpenseItemType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  createDraft,
  decideDocument,
  saveDocument,
  submitDocument,
  toBytes,
  type SaveDocumentInput,
} from "@/lib/domain/documents";
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead,
} from "@/lib/domain/notifications";

const SIGNATURE = toBytes(new Uint8Array([137, 80, 78, 71]));

const input: SaveDocumentInput = {
  project: null,
  description: null,
  reason: null,
  paymentType: "CASH",
  includeCertificate: true,
  items: [{ type: ExpenseItemType.TOLL, incurredOn: "2026-07-28", amount: 75 }],
};

let approver: { id: string };
let staff: { id: string };
let stranger: { id: string };

async function wipe() {
  await prisma.expenseDocument.deleteMany();
  await prisma.documentSequence.deleteMany();
  await prisma.user.updateMany({ data: { approverId: null } });
  await prisma.user.deleteMany();
}

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
  staff = await prisma.user.create({
    data: {
      email: "staff@assetfive.co.th",
      name: "ณัฐวุฒิ ศรีสุข",
      roles: [AppRole.REQUESTER],
      approverId: approver.id,
    },
    select: { id: true },
  });
  stranger = await prisma.user.create({
    data: { email: "other@assetfive.co.th", roles: [AppRole.REQUESTER] },
    select: { id: true },
  });
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

async function submitted() {
  const id = await createDraft(staff.id);
  await saveDocument(id, staff.id, input);
  await submitDocument(id, staff.id, SIGNATURE);
  return id;
}

describe("listNotifications", () => {
  it("tells the requester about a verdict on their document", async () => {
    const id = await submitted();
    await decideDocument(id, approver.id, {
      decision: "return",
      reason: "แนบเอกสารไม่ครบ",
    });

    const items = await listNotifications(staff.id, null);
    assert.equal(items.length, 1);
    assert.equal(items[0].action, "RETURNED");
    assert.equal(items[0].detail, "แนบเอกสารไม่ครบ");
    assert.equal(items[0].href, `/documents/${id}`);
  });

  it("does not report the requester's own submission back to them", async () => {
    await submitted();

    const items = await listNotifications(staff.id, null);
    assert.deepEqual(items, []);
  });

  it("tells the approver about a submission waiting on them", async () => {
    const id = await submitted();

    const items = await listNotifications(approver.id, null);
    assert.equal(items.length, 1);
    assert.equal(items[0].action, "SUBMITTED");
    // The approver goes to the review screen, not the read-only view.
    assert.equal(items[0].href, `/approve/${id}`);
  });

  it("drops a waiting item once it has been decided", async () => {
    const id = await submitted();
    await decideDocument(id, approver.id, {
      decision: "approve",
      signature: SIGNATURE,
    });

    const items = await listNotifications(approver.id, null);
    assert.deepEqual(items, []);
  });

  it("shows nothing to someone the document has no bearing on", async () => {
    await submitted();

    const items = await listNotifications(stranger.id, null);
    assert.deepEqual(items, []);
  });

  it("marks items after the read mark as unread and the rest as read", async () => {
    const id = await submitted();
    await decideDocument(id, approver.id, {
      decision: "reject",
      reason: "จำนวนเงินไม่ถูกต้อง",
    });

    const [event] = await listNotifications(staff.id, null);
    assert.equal(event.unread, true);

    // A mark taken after the event covers it.
    const later = new Date(event.at.getTime() + 1000);
    const [seen] = await listNotifications(staff.id, later);
    assert.equal(seen.unread, false);
  });
});

describe("countUnreadNotifications", () => {
  it("counts what is new and settles at zero once read", async () => {
    const id = await submitted();
    await decideDocument(id, approver.id, {
      decision: "return",
      reason: "เหตุผลไม่ชัดเจน",
    });

    assert.equal(await countUnreadNotifications(staff.id), 1);

    await markNotificationsRead(staff.id);
    assert.equal(await countUnreadNotifications(staff.id), 0);
  });

  it("counts a resubmission for the approver", async () => {
    const id = await submitted();
    await decideDocument(id, approver.id, {
      decision: "return",
      reason: "แนบเอกสารไม่ครบ",
    });
    await markNotificationsRead(approver.id);

    await saveDocument(id, staff.id, input);
    await submitDocument(id, staff.id, SIGNATURE);

    assert.equal(await countUnreadNotifications(approver.id), 1);
  });
});
