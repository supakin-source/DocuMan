import { ExpenseStatus, type ExpenseItemType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  appendItem,
  createDraft,
  submitDocument,
  toBytes,
} from "@/lib/domain/documents";
import { ValidationError } from "@/lib/domain/errors";
import { DEFAULT_RATE_PER_KM, computeItemAmount } from "@/lib/domain/items";
import { getMessageContent } from "@/lib/line/client";
import { extractTravelItem } from "@/lib/ocr/travel";
import { storeAttachment } from "@/lib/storage/attachments";

/**
 * The claim, as a conversation.
 *
 * The web screens are a wizard: pick a category, upload everything, review,
 * sign, submit. A chat has no steps — a photo arrives, and it has to land
 * somewhere sensible without asking which claim it belongs to. So "the current
 * claim" is derived rather than tracked: the most recently touched document
 * that is still editable, which is the draft being built, or the document an
 * approver has just sent back. Both are the thing the next photo belongs to,
 * and neither needs a session table to remember.
 */

/** A line as it stands after OCR, with what is still missing spelled out. */
export type DraftLine = {
  id: string;
  type: ExpenseItemType;
  incurredOn: Date;
  origin: string | null;
  destination: string | null;
  distanceKm: number | null;
  ratePerKm: number | null;
  amount: number;
  /** Fields the user must supply before this line can be submitted. */
  missing: string[];
};

export type DraftState = {
  documentId: string;
  status: ExpenseStatus;
  docNo: string | null;
  decisionReason: string | null;
  lines: DraftLine[];
  total: number;
  /** True when nothing is missing and the claim could be sent as it stands. */
  complete: boolean;
};

/**
 * The document the next receipt belongs to, created if there is none.
 *
 * `updatedAt` rather than `createdAt` decides which one: a returned document is
 * touched at the moment it is returned, so it becomes the current claim just as
 * the requester is being told to fix it — which is when they will send the
 * replacement receipt.
 */
export async function currentDocumentId(userId: string): Promise<string> {
  const open = await prisma.expenseDocument.findFirst({
    where: {
      ownerId: userId,
      status: { in: [ExpenseStatus.DRAFT, ExpenseStatus.CORRECTION] },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  return open?.id ?? (await createDraft(userId));
}

/** Abandons the current claim and starts a fresh one. */
export async function startNewDraft(userId: string): Promise<string> {
  return createDraft(userId);
}

/** Reads the current claim back, with each line's gaps worked out. */
export async function readDraft(documentId: string): Promise<DraftState | null> {
  const document = await prisma.expenseDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      status: true,
      docNo: true,
      decisionReason: true,
      totalAmount: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          type: true,
          incurredOn: true,
          origin: true,
          destination: true,
          distanceKm: true,
          ratePerKm: true,
          amount: true,
        },
      },
    },
  });

  if (!document) return null;

  const lines = document.items.map((item) => toDraftLine(item));

  return {
    documentId: document.id,
    status: document.status,
    docNo: document.docNo,
    decisionReason: document.decisionReason,
    lines,
    total: Number(document.totalAmount),
    complete: lines.length > 0 && lines.every((line) => line.missing.length === 0),
  };
}

/** What a single line still needs, in the words the bot will use for it. */
function toDraftLine(item: {
  id: string;
  type: ExpenseItemType;
  incurredOn: Date;
  origin: string | null;
  destination: string | null;
  distanceKm: unknown;
  ratePerKm: unknown;
  amount: unknown;
}): DraftLine {
  const distanceKm = item.distanceKm === null ? null : Number(item.distanceKm);
  const ratePerKm = item.ratePerKm === null ? null : Number(item.ratePerKm);
  const amount = Number(item.amount);

  const missing: string[] = [];
  if (item.type === "PERSONAL_VEHICLE") {
    if (!distanceKm) missing.push("ระยะทาง");
    if (!ratePerKm) missing.push("อัตราต่อกิโลเมตร");
  } else if (!amount) {
    missing.push("จำนวนเงิน");
  }
  if (item.type !== "TOLL") {
    if (!item.origin) missing.push("ต้นทาง");
    if (!item.destination) missing.push("ปลายทาง");
  }

  return {
    id: item.id,
    type: item.type,
    incurredOn: item.incurredOn,
    origin: item.origin,
    destination: item.destination,
    distanceKm,
    ratePerKm,
    amount,
    missing,
  };
}

/**
 * Turns a photo the user sent into a line on their current claim.
 *
 * Storing and reading run together rather than one after the other: they need
 * the same bytes and neither depends on the other's result, and the user is
 * watching a chat window for the answer. Reading is allowed to fail — a blurry
 * photo still becomes a line, blank, for them to fill in, rather than an error
 * that leaves them holding a receipt with nowhere to put it.
 */
export async function addReceipt(input: {
  userId: string;
  messageId: string;
}): Promise<{ documentId: string; itemId: string; state: DraftState }> {
  const documentId = await currentDocumentId(input.userId);
  const content = await getMessageContent(input.messageId);
  const bytes = toBytes(content.bytes);

  const [attachment, extraction] = await Promise.all([
    storeAttachment({
      documentId,
      fileName: `line-${input.messageId}.jpg`,
      mimeType: content.mimeType,
      bytes,
    }),
    extractTravelItem({ bytes, mimeType: content.mimeType }).catch(
      (error: unknown) => {
        console.error("OCR failed for a LINE receipt on document", documentId, error);
        return null;
      },
    ),
  ]);

  const type = extraction?.type ?? "PUBLIC_TRANSPORT";
  const isMileage = type === "PERSONAL_VEHICLE";

  const created = await appendItem(documentId, input.userId, {
    type,
    // The claim is for a journey that has happened, so today is the safest
    // stand-in when the document does not print a date — and it is the one the
    // user is most likely to accept without editing.
    incurredOn: (extraction?.incurredOn ?? new Date().toISOString().slice(0, 10)),
    origin: extraction?.origin ?? null,
    destination: extraction?.destination ?? null,
    purpose: "ไปปฏิบัติงาน",
    distanceKm: extraction?.distanceKm ?? null,
    ratePerKm: isMileage ? (extraction?.ratePerKm ?? DEFAULT_RATE_PER_KM) : null,
    // Zero rather than a refusal: an unreadable amount is a gap to fill, and
    // submitDocument already blocks a claim that still has one.
    amount: computeItemAmount({
      type,
      distanceKm: extraction?.distanceKm,
      ratePerKm: extraction?.ratePerKm ?? DEFAULT_RATE_PER_KM,
      amount: extraction?.amount,
    }),
    attachmentId: attachment.id,
  });

  const state = await readDraft(documentId);
  if (!state) throw new ValidationError("ไม่พบเอกสาร");

  return { documentId, itemId: created.id, state };
}

/**
 * Signs and submits the current claim on the user's behalf.
 *
 * The signature is the one stored on their account, drawn once and reused —
 * there is no canvas in a chat window. `submitDocument` copies it onto the
 * document, so a later change to the stored mark does not rewrite claims that
 * were already signed with the old one.
 */
export async function submitClaim(
  userId: string,
  documentId: string,
): Promise<{
  docNo: string | null;
  total: number;
  approverLineUserId: string | null;
  approverName: string | null;
  requesterName: string | null;
}> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      name: true,
      signature: true,
      approver: { select: { name: true, lineUserId: true } },
    },
  });

  if (!user.signature?.byteLength) {
    throw new ValidationError("SIGNATURE_REQUIRED");
  }

  const document = await submitDocument(
    documentId,
    userId,
    toBytes(user.signature),
  );

  return {
    docNo: document.docNo,
    total: Number(document.totalAmount),
    approverLineUserId: user.approver?.lineUserId ?? null,
    approverName: user.approver?.name ?? null,
    requesterName: user.name ?? null,
  };
}
