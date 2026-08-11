import { z } from "zod";

import { AppRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/domain/errors";

/**
 * How deep an approval chain may be walked when checking for a loop. Well past
 * any real org chart; the bound only stops a pre-existing cycle in the data
 * from spinning the walk forever.
 */
const MAX_CHAIN_DEPTH = 64;

export const userProfileSchema = z.object({
  /** Payroll identifier printed on the document, e.g. EMP-10234. */
  employeeCode: z
    .string()
    .trim()
    .max(40)
    .transform((value) => value || null)
    .nullable(),
  position: z
    .string()
    .trim()
    .max(120)
    .transform((value) => value || null)
    .nullable(),
  department: z
    .string()
    .trim()
    .max(120)
    .transform((value) => value || null)
    .nullable(),
  /** Who decides this person's claims. Null leaves them unable to submit. */
  approverId: z
    .string()
    .trim()
    .transform((value) => value || null)
    .nullable(),
  roles: z.array(z.enum(AppRole)).min(1, "ต้องมีอย่างน้อยหนึ่งบทบาท"),
});

export type UserProfileInput = z.infer<typeof userProfileSchema>;

export const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  roles: true,
  employeeCode: true,
  position: true,
  department: true,
  approverId: true,
  approver: { select: { id: true, name: true, email: true } },
} as const;

/** Everyone, for the admin list. */
export function listUsers() {
  return prisma.user.findMany({
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: adminUserSelect,
  });
}

export async function getUserForAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: adminUserSelect,
  });
  if (!user) throw new NotFoundError("ไม่พบผู้ใช้งาน");
  return user;
}

/** Accounts that may be picked as an approver: anyone holding the role. */
export function listApproverCandidates() {
  return prisma.user.findMany({
    where: { roles: { has: AppRole.APPROVER } },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, position: true },
  });
}

/**
 * Walks up from `startId` to see whether `targetId` appears in the chain.
 *
 * Used before assigning an approver: if the candidate already reports, directly
 * or through others, to the person being edited, the assignment would close a
 * loop and no document in it could ever reach someone allowed to decide it.
 */
async function reportsTo(startId: string, targetId: string): Promise<boolean> {
  let currentId: string | null = startId;

  for (let depth = 0; depth < MAX_CHAIN_DEPTH && currentId; depth += 1) {
    if (currentId === targetId) return true;

    const current: { approverId: string | null } | null =
      await prisma.user.findUnique({
        where: { id: currentId },
        select: { approverId: true },
      });

    currentId = current?.approverId ?? null;
  }

  return false;
}

/**
 * Updates the HR fields Google sign-in cannot supply.
 *
 * `actingUserId` is the admin making the change; it is what stops an admin from
 * removing their own ADMIN role and locking the organisation out of this screen.
 */
export async function updateUserProfile(
  userId: string,
  actingUserId: string,
  input: UserProfileInput,
): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, roles: true },
  });
  if (!target) throw new NotFoundError("ไม่พบผู้ใช้งาน");

  if (input.approverId) {
    if (input.approverId === userId) {
      throw new ValidationError("ไม่สามารถกำหนดให้เป็นผู้อนุมัติของตนเองได้");
    }

    const approver = await prisma.user.findUnique({
      where: { id: input.approverId },
      select: { roles: true },
    });
    if (!approver) {
      throw new ValidationError("ไม่พบผู้อนุมัติที่เลือก");
    }
    if (!approver.roles.includes(AppRole.APPROVER)) {
      throw new ValidationError("ผู้ที่เลือกไม่มีบทบาทผู้อนุมัติ");
    }
    if (await reportsTo(input.approverId, userId)) {
      throw new ValidationError(
        "ไม่สามารถกำหนดได้ เพราะจะทำให้สายการอนุมัติวนกลับมาหาผู้ใช้รายนี้",
      );
    }
  }

  const losesAdmin =
    target.roles.includes(AppRole.ADMIN) && !input.roles.includes(AppRole.ADMIN);
  if (losesAdmin && userId === actingUserId) {
    throw new ForbiddenError(
      "ไม่สามารถถอนบทบาทผู้ดูแลระบบของตนเองได้ กรุณาให้ผู้ดูแลระบบท่านอื่นดำเนินการ",
    );
  }

  // Dropping the approver role from someone others report to would leave those
  // claims undecidable, so the reports are surfaced rather than silently orphaned.
  if (
    target.roles.includes(AppRole.APPROVER) &&
    !input.roles.includes(AppRole.APPROVER)
  ) {
    const reports = await prisma.user.count({ where: { approverId: userId } });
    if (reports > 0) {
      throw new ValidationError(
        `ยังมีผู้ใช้ ${reports} คนที่ใช้บัญชีนี้เป็นผู้อนุมัติ กรุณาเปลี่ยนผู้อนุมัติของพวกเขาก่อน`,
      );
    }
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        employeeCode: input.employeeCode,
        position: input.position,
        department: input.department,
        approverId: input.approverId,
        roles: input.roles,
      },
    });
  } catch (error) {
    // employeeCode is unique; a clash is the admin's mistake, not a server fault.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new ValidationError("รหัสพนักงานนี้ถูกใช้กับบัญชีอื่นแล้ว");
    }
    throw error;
  }
}
