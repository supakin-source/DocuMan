import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import {
  DocumentAction,
  ExpenseStatus,
  PaymentType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { allocateDocNumber } from "@/lib/domain/doc-number";
import {
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "@/lib/domain/errors";
import {
  computeItemAmount,
  expenseItemInputSchema,
  type ExpenseItemInput,
} from "@/lib/domain/items";

/** Role label written onto timeline entries, mirroring the design's wording. */
const ROLE_REQUESTER = "พนักงาน";
const ROLE_APPROVER = "หัวหน้างาน";

/** Statuses a requester may still edit. */
const EDITABLE_STATUSES: ExpenseStatus[] = [
  ExpenseStatus.DRAFT,
  ExpenseStatus.CORRECTION,
];

/**
 * Signature bytes as Prisma 7 wants them. Node's `Buffer` is a
 * `Uint8Array<ArrayBufferLike>`, which is not assignable to the generated
 * `Uint8Array<ArrayBuffer>`, so callers pass through `toBytes` first.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/** Copies any byte source into a plain, non-shared `Uint8Array`. */
export function toBytes(source: Uint8Array | ArrayBuffer): Bytes {
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

// Written as a standalone object rather than spread into each query: Prisma
// infers the payload type from the `include` property being present literally
// at the call site, and spreading a wrapper loses the relations.
export const documentInclude = {
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      employeeCode: true,
      position: true,
      department: true,
      approver: { select: { id: true, name: true, position: true } },
    },
  },
  decidedBy: { select: { id: true, name: true, position: true } },
  items: {
    orderBy: { sortOrder: "asc" },
    include: { attachment: true },
  },
  attachments: true,
  timeline: { orderBy: { at: "asc" } },
} satisfies Prisma.ExpenseDocumentInclude;

export type DocumentDetail = Prisma.ExpenseDocumentGetPayload<{
  include: typeof documentInclude;
}>;

// ─── Reads ────────────────────────────────────────────────────────────────

/**
 * Loads a document the given user is entitled to see: its owner, or the
 * approver the owner reports to. Anyone else gets ForbiddenError rather than
 * NotFoundError only once existence is established — the document id is not a
 * secret, but its contents are.
 */
export async function getDocumentFor(
  documentId: string,
  userId: string,
): Promise<DocumentDetail> {
  const document = await prisma.expenseDocument.findUnique({
    where: { id: documentId },
    include: documentInclude,
  });

  if (!document) throw new NotFoundError();

  const isOwner = document.ownerId === userId;
  const isAssignedApprover = document.owner.approver?.id === userId;
  const hasDecided = document.decidedById === userId;

  if (!isOwner && !isAssignedApprover && !hasDecided) {
    throw new ForbiddenError();
  }

  return document;
}

/** Documents the user raised, newest first. */
export function listOwnDocuments(
  userId: string,
  options: { status?: ExpenseStatus; take?: number } = {},
) {
  return prisma.expenseDocument.findMany({
    where: {
      ownerId: userId,
      ...(options.status ? { status: options.status } : {}),
      // A draft is scaffolding for a submission in progress, not a document the
      // owner has produced; it stays out of the list until submitted.
      ...(options.status ? {} : { status: { not: ExpenseStatus.DRAFT } }),
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    take: options.take ?? 20,
    include: { owner: { select: { name: true, position: true } } },
  });
}

/**
 * Documents awaiting this approver's decision.
 *
 * Scoped to people who report to them — the prototype showed every pending
 * document that was not the viewer's own, which would leak other teams' claims.
 * Their own document is excluded regardless, since nobody approves themselves.
 */
export function listPendingForApprover(approverId: string, take = 50) {
  return prisma.expenseDocument.findMany({
    where: {
      status: ExpenseStatus.PENDING,
      ownerId: { not: approverId },
      owner: { approverId },
    },
    orderBy: { submittedAt: "asc" },
    take,
    include: {
      owner: {
        select: { id: true, name: true, position: true, department: true },
      },
    },
  });
}

/** Documents this approver has already approved, for the dashboard statistics. */
export function listApprovedByApprover(approverId: string, take = 500) {
  return prisma.expenseDocument.findMany({
    where: { status: ExpenseStatus.APPROVED, decidedById: approverId },
    orderBy: { decidedAt: "desc" },
    take,
    include: { owner: { select: { id: true, name: true } } },
  });
}

// ─── Writes ───────────────────────────────────────────────────────────────

export const saveDocumentSchema = z.object({
  project: z.string().trim().max(120).nullish(),
  description: z.string().trim().max(500).nullish(),
  reason: z.string().trim().max(500).nullish(),
  paymentType: z.enum(PaymentType).default(PaymentType.CASH),
  includeCertificate: z.boolean().default(true),
  items: z.array(expenseItemInputSchema).min(1, "ต้องมีอย่างน้อยหนึ่งรายการ"),
});

export type SaveDocumentInput = z.infer<typeof saveDocumentSchema>;

/** Creates an empty draft for the user to build on. */
export async function createDraft(userId: string) {
  const document = await prisma.expenseDocument.create({
    data: { ownerId: userId },
    select: { id: true },
  });
  return document.id;
}

/**
 * Replaces a draft's contents. Items are rewritten wholesale rather than
 * diffed: the OCR screen hands back the entire list every time, and a partial
 * update would leave orphaned lines behind.
 */
export async function saveDocument(
  documentId: string,
  userId: string,
  input: SaveDocumentInput,
): Promise<void> {
  const existing = await prisma.expenseDocument.findUnique({
    where: { id: documentId },
    select: { ownerId: true, status: true },
  });

  if (!existing) throw new NotFoundError();
  if (existing.ownerId !== userId) throw new ForbiddenError();
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw new InvalidStateError("เอกสารนี้ส่งอนุมัติแล้ว ไม่สามารถแก้ไขได้");
  }

  const items = input.items.map(toItemCreate);
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  await prisma.$transaction(async (tx) => {
    // Attachment.itemId is SetNull on delete, so replacing the lines detaches
    // the Drive files without deleting them; they are re-linked below.
    await tx.expenseItem.deleteMany({ where: { documentId } });

    await tx.expenseDocument.update({
      where: { id: documentId },
      data: {
        project: input.project ?? null,
        description: input.description ?? null,
        reason: input.reason ?? null,
        paymentType: input.paymentType,
        includeCertificate: input.includeCertificate,
        totalAmount: total,
      },
    });

    // Created one at a time because each line's id is needed to point its
    // attachment at it, and a nested createMany does not hand the ids back.
    for (const [index, item] of items.entries()) {
      const created = await tx.expenseItem.create({
        data: { documentId, ...item },
        select: { id: true },
      });

      const driveFileId = input.items[index].driveFileId;
      if (!driveFileId) continue;

      // Scoped to this document so a client cannot attach someone else's file
      // by quoting its Drive id.
      await tx.attachment.updateMany({
        where: { documentId, driveFileId },
        data: { itemId: created.id },
      });
    }
  });
}

function toItemCreate(item: ExpenseItemInput, index: number) {
  const amount = computeItemAmount({
    type: item.type,
    distanceKm: item.distanceKm,
    ratePerKm: item.ratePerKm,
    amount: item.amount,
  });

  return {
    type: item.type,
    // Parsed as UTC midnight so the stored `date` is the day the user picked,
    // whatever zone the server runs in.
    incurredOn: new Date(`${item.incurredOn}T00:00:00.000Z`),
    origin: item.origin ?? null,
    destination: item.destination ?? null,
    purpose: item.purpose ?? null,
    distanceKm: item.distanceKm ?? null,
    ratePerKm: item.ratePerKm ?? null,
    amount,
    sortOrder: index,
  };
}

/**
 * Signs and submits a document for approval.
 *
 * A returned document takes the same path: it re-enters PENDING, keeps the
 * number it was already issued, and records RESUBMITTED so the trail shows the
 * round trip.
 */
export async function submitDocument(
  documentId: string,
  userId: string,
  signature: Bytes,
): Promise<DocumentDetail> {
  if (signature.byteLength === 0) {
    throw new ValidationError("กรุณาลงลายเซ็นก่อนส่งอนุมัติ");
  }

  const existing = await prisma.expenseDocument.findUnique({
    where: { id: documentId },
    select: {
      ownerId: true,
      status: true,
      docNo: true,
      owner: { select: { name: true, approverId: true } },
      items: { select: { id: true, amount: true } },
    },
  });

  if (!existing) throw new NotFoundError();
  if (existing.ownerId !== userId) throw new ForbiddenError();
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw new InvalidStateError("เอกสารนี้ส่งอนุมัติแล้ว");
  }
  if (existing.items.length === 0) {
    throw new ValidationError("ต้องมีอย่างน้อยหนึ่งรายการก่อนส่งอนุมัติ");
  }
  if (existing.items.some((item) => Number(item.amount) <= 0)) {
    throw new ValidationError("ทุกรายการต้องมีจำนวนเงินมากกว่าศูนย์");
  }
  if (!existing.owner.approverId) {
    throw new InvalidStateError(
      "บัญชีของคุณยังไม่ได้กำหนดผู้อนุมัติ กรุณาติดต่อผู้ดูแลระบบ",
    );
  }

  const isResubmission = existing.status === ExpenseStatus.CORRECTION;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const docNo = existing.docNo ?? (await allocateDocNumber(tx, now.getFullYear()));

    return tx.expenseDocument.update({
      where: { id: documentId },
      data: {
        docNo,
        status: ExpenseStatus.PENDING,
        submittedAt: now,
        requesterSignature: signature,
        // Clear the previous verdict so a returned document does not show a
        // stale reason once it is back in the approver's queue.
        decisionReason: null,
        decisionComment: null,
        decidedAt: null,
        decidedById: null,
        approverSignature: null,
        timeline: {
          create: {
            action: isResubmission
              ? DocumentAction.RESUBMITTED
              : DocumentAction.SUBMITTED,
            actorId: userId,
            actorName: existing.owner.name ?? "",
            actorRole: ROLE_REQUESTER,
            at: now,
          },
        },
      },
      include: documentInclude,
    });
  });
}

export type Decision = "approve" | "return" | "reject";

const DECISION_STATUS: Record<Decision, ExpenseStatus> = {
  approve: ExpenseStatus.APPROVED,
  return: ExpenseStatus.CORRECTION,
  reject: ExpenseStatus.REJECTED,
};

const DECISION_ACTION: Record<Decision, DocumentAction> = {
  approve: DocumentAction.APPROVED,
  return: DocumentAction.RETURNED,
  reject: DocumentAction.REJECTED,
};

export const decideDocumentSchema = z.object({
  decision: z.enum(["approve", "return", "reject"]),
  /** Required for return and reject; ignored on approve. */
  reason: z.string().trim().min(1).max(500).nullish(),
  comment: z.string().trim().max(1000).nullish(),
  /** Base64 PNG of the approver's signature. Required on approve. */
  signature: z.string().nullish(),
});

export type DecideDocumentInput = z.infer<typeof decideDocumentSchema>;

/**
 * Records an approver's verdict.
 *
 * Refuses a document the caller owns even if they hold the approver role: the
 * design states this rule on screen, and it is enforced here rather than in the
 * UI so a crafted request cannot get around it.
 */
export async function decideDocument(
  documentId: string,
  approverId: string,
  input: Omit<DecideDocumentInput, "signature"> & { signature?: Bytes | null },
): Promise<DocumentDetail> {
  const existing = await prisma.expenseDocument.findUnique({
    where: { id: documentId },
    select: {
      ownerId: true,
      status: true,
      owner: { select: { approverId: true } },
    },
  });

  if (!existing) throw new NotFoundError();
  if (existing.ownerId === approverId) {
    throw new ForbiddenError("ไม่สามารถอนุมัติเอกสารของตนเองได้");
  }
  if (existing.owner.approverId !== approverId) {
    throw new ForbiddenError("คุณไม่ใช่ผู้อนุมัติของเอกสารนี้");
  }
  if (existing.status !== ExpenseStatus.PENDING) {
    throw new InvalidStateError("เอกสารนี้ได้รับการพิจารณาแล้ว");
  }
  if (input.decision !== "approve" && !input.reason) {
    throw new ValidationError("กรุณาเลือกเหตุผล");
  }
  if (input.decision === "approve" && !input.signature?.byteLength) {
    throw new ValidationError("กรุณาลงลายเซ็นก่อนอนุมัติ");
  }

  const approver = await prisma.user.findUniqueOrThrow({
    where: { id: approverId },
    select: { name: true },
  });

  const now = new Date();
  const detail =
    input.decision === "approve" ? null : (input.reason ?? null);

  return prisma.expenseDocument.update({
    where: { id: documentId },
    data: {
      status: DECISION_STATUS[input.decision],
      decidedById: approverId,
      decidedAt: now,
      decisionReason: input.decision === "approve" ? null : (input.reason ?? null),
      decisionComment: input.comment ?? null,
      approverSignature:
        input.decision === "approve" ? (input.signature ?? null) : null,
      timeline: {
        create: {
          action: DECISION_ACTION[input.decision],
          detail,
          actorId: approverId,
          actorName: approver.name ?? "",
          actorRole: ROLE_APPROVER,
          at: now,
        },
      },
    },
    include: documentInclude,
  });
}
