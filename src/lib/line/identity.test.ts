import "dotenv/config";

import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { AppRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { findUserByLineId, listAdminLineIds } from "@/lib/line/identity";

async function wipe() {
  await prisma.expenseDocument.deleteMany();
  await prisma.documentSequence.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(wipe);

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

function person(input: {
  email: string;
  roles: AppRole[];
  lineUserId?: string | null;
}) {
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.email.split("@")[0],
      roles: input.roles,
      lineUserId: input.lineUserId ?? null,
    },
    select: { id: true },
  });
}

describe("findUserByLineId", () => {
  it("finds the account a LINE id was linked to", async () => {
    const created = await person({
      email: "staff@assetfive.co.th",
      roles: [AppRole.REQUESTER],
      lineUserId: "Ustaff",
    });

    assert.equal((await findUserByLineId("Ustaff"))?.id, created.id);
  });

  it("does not recognise a LINE id nobody has linked", async () => {
    await person({ email: "staff@assetfive.co.th", roles: [AppRole.REQUESTER] });

    assert.equal(await findUserByLineId("Ustranger"), null);
  });
});

describe("listAdminLineIds", () => {
  it("names the admins who can actually be sent to", async () => {
    await person({
      email: "a-admin@assetfive.co.th",
      roles: [AppRole.ADMIN],
      lineUserId: "Uadmin1",
    });
    await person({
      email: "b-admin@assetfive.co.th",
      roles: [AppRole.REQUESTER, AppRole.ADMIN],
      lineUserId: "Uadmin2",
    });

    assert.deepEqual(await listAdminLineIds(), ["Uadmin1", "Uadmin2"]);
  });

  it("leaves out an admin who has not linked LINE", async () => {
    // Not a failure to report to the approver, who can do nothing about it —
    // but there is nowhere to send the document, so they are not a recipient.
    await person({ email: "admin@assetfive.co.th", roles: [AppRole.ADMIN] });

    assert.deepEqual(await listAdminLineIds(), []);
  });

  it("leaves out everyone who is not an admin", async () => {
    // The approved document goes to whoever files it, not to every linked
    // account — an approver seeing their own decision come back would be
    // noise, and a requester seeing one is someone else's paperwork.
    await person({
      email: "staff@assetfive.co.th",
      roles: [AppRole.REQUESTER],
      lineUserId: "Ustaff",
    });
    await person({
      email: "boss@assetfive.co.th",
      roles: [AppRole.APPROVER],
      lineUserId: "Uboss",
    });

    assert.deepEqual(await listAdminLineIds(), []);
  });
});
