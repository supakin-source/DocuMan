import "dotenv/config";

import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { AppRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/domain/errors";
import {
  getUserForAdmin,
  listApproverCandidates,
  updateUserProfile,
  type UserProfileInput,
} from "@/lib/domain/users";

let admin: { id: string };
let boss: { id: string };
let staff: { id: string };

const base: UserProfileInput = {
  employeeCode: null,
  position: null,
  department: null,
  approverId: null,
  roles: [AppRole.REQUESTER],
};

async function wipe() {
  await prisma.expenseDocument.deleteMany();
  // Clear the self-references before deleting, so the rows have nothing to hold.
  await prisma.user.updateMany({ data: { approverId: null } });
  await prisma.user.deleteMany();
}

beforeEach(async () => {
  await wipe();

  admin = await prisma.user.create({
    data: {
      email: "admin@assetfive.co.th",
      name: "ผู้ดูแลระบบ",
      roles: [AppRole.ADMIN, AppRole.APPROVER],
    },
    select: { id: true },
  });
  boss = await prisma.user.create({
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
    },
    select: { id: true },
  });
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe("updateUserProfile", () => {
  it("saves the fields Google sign-in cannot supply", async () => {
    await updateUserProfile(staff.id, admin.id, {
      ...base,
      employeeCode: "EMP-10234",
      position: "เจ้าหน้าที่ขายอาวุโส",
      department: "ฝ่ายขาย",
      approverId: boss.id,
    });

    const saved = await getUserForAdmin(staff.id);
    assert.equal(saved.employeeCode, "EMP-10234");
    assert.equal(saved.position, "เจ้าหน้าที่ขายอาวุโส");
    assert.equal(saved.department, "ฝ่ายขาย");
    assert.equal(saved.approver?.id, boss.id);
  });

  it("rejects a duplicate employee code with a usable message", async () => {
    await updateUserProfile(staff.id, admin.id, { ...base, employeeCode: "EMP-1" });

    await assert.rejects(
      () => updateUserProfile(boss.id, admin.id, { ...base, roles: [AppRole.APPROVER], employeeCode: "EMP-1" }),
      (error: unknown) =>
        error instanceof ValidationError && error.message.includes("รหัสพนักงาน"),
    );
  });

  it("refuses to make someone their own approver", async () => {
    await assert.rejects(
      () => updateUserProfile(staff.id, admin.id, { ...base, approverId: staff.id }),
      ValidationError,
    );
  });

  it("refuses an approver who does not hold the role", async () => {
    const plain = await prisma.user.create({
      data: { email: "plain@assetfive.co.th", roles: [AppRole.REQUESTER] },
      select: { id: true },
    });

    await assert.rejects(
      () => updateUserProfile(staff.id, admin.id, { ...base, approverId: plain.id }),
      ValidationError,
    );
  });

  it("refuses an assignment that would close a loop in the chain", async () => {
    // boss already reports to staff, so making boss the approver of staff would
    // leave both of their claims with nobody able to decide them.
    await updateUserProfile(boss.id, admin.id, {
      ...base,
      roles: [AppRole.APPROVER, AppRole.REQUESTER],
      approverId: admin.id,
    });
    await updateUserProfile(staff.id, admin.id, {
      ...base,
      roles: [AppRole.REQUESTER, AppRole.APPROVER],
      approverId: boss.id,
    });
    // admin → staff closes admin → staff → boss → admin.
    await assert.rejects(
      () =>
        updateUserProfile(admin.id, admin.id, {
          ...base,
          roles: [AppRole.ADMIN, AppRole.APPROVER],
          approverId: staff.id,
        }),
      ValidationError,
    );
  });

  it("allows a normal two-level chain", async () => {
    await updateUserProfile(boss.id, admin.id, {
      ...base,
      roles: [AppRole.APPROVER, AppRole.REQUESTER],
      approverId: admin.id,
    });
    await updateUserProfile(staff.id, admin.id, { ...base, approverId: boss.id });

    const saved = await getUserForAdmin(staff.id);
    assert.equal(saved.approver?.id, boss.id);
  });

  it("stops an admin removing their own admin role", async () => {
    await assert.rejects(
      () =>
        updateUserProfile(admin.id, admin.id, {
          ...base,
          roles: [AppRole.APPROVER],
        }),
      ForbiddenError,
    );
  });

  it("lets another admin remove it", async () => {
    const second = await prisma.user.create({
      data: { email: "admin2@assetfive.co.th", roles: [AppRole.ADMIN] },
      select: { id: true },
    });

    await updateUserProfile(admin.id, second.id, {
      ...base,
      roles: [AppRole.APPROVER],
    });

    const saved = await getUserForAdmin(admin.id);
    assert.deepEqual(saved.roles, [AppRole.APPROVER]);
  });

  it("will not strip the approver role while people still report to them", async () => {
    await updateUserProfile(staff.id, admin.id, { ...base, approverId: boss.id });

    await assert.rejects(
      () =>
        updateUserProfile(boss.id, admin.id, { ...base, roles: [AppRole.REQUESTER] }),
      (error: unknown) =>
        error instanceof ValidationError && error.message.includes("1 คน"),
    );
  });
});

describe("listApproverCandidates", () => {
  it("returns only accounts holding the approver role", async () => {
    const candidates = await listApproverCandidates();
    assert.deepEqual(
      candidates.map((user) => user.id).sort(),
      [admin.id, boss.id].sort(),
    );
  });
});
