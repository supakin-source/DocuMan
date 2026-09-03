import { prisma } from "@/lib/db";
import { pdfLink } from "@/lib/documents/pdf-link";
import {
  decideDocument,
  listApprovedByApprover,
  removeItem,
  toBytes,
} from "@/lib/domain/documents";
import {
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "@/lib/domain/errors";
import { summariseMonth } from "@/lib/domain/stats";
import { liffUrl } from "@/lib/env";
import {
  currentDocumentId,
  processPendingReceipts,
  readDraft,
  receiveReceipt,
  startNewDraft,
  submitClaim,
  type DraftLine,
  type DraftState,
} from "@/lib/line/claim";
import { push, replyOrPush, type LineMessage } from "@/lib/line/client";
import {
  approvalRequestCard,
  approvedDocumentCard,
  draftCard,
  monthSummaryCard,
  reasonPicker,
  receiptCard,
} from "@/lib/line/flex";
import { isApprover, listAdminLineIds, type LineUser } from "@/lib/line/identity";
import { decodePostback, type Postback } from "@/lib/line/postback";
import { formatMoney } from "@/lib/thai";

/**
 * What each kind of message means, and what the bot does about it.
 *
 * Everything here answers through `replyOrPush`, which keeps one property true
 * across the whole flow: a tap or a photo always gets a visible answer, even
 * when the work behind it outran the reply token. A chat that silently does
 * nothing is indistinguishable from a chat that is broken.
 */

export function text(value: string): LineMessage {
  return { type: "text", text: value };
}

// ─── Text ─────────────────────────────────────────────────────────────────

/**
 * Commands, matched on a substring rather than an exact string.
 *
 * People type "ขอสรุปยอดหน่อย", not "สรุป". The list is ordered, so the more
 * specific phrase has to come first where two overlap.
 */
const COMMANDS: { match: string[]; command: Command }[] = [
  { match: ["ครบแล้ว", "ครบทุกใบ", "หมดแล้ว", "อ่านเลย"], command: "confirm" },
  { match: ["เริ่มใหม่", "สร้างใหม่", "ใบใหม่"], command: "new" },
  { match: ["ส่งอนุมัติ", "ส่งเบิก", "ขออนุมัติ"], command: "submit" },
  { match: ["สรุป", "ยอดเดือน", "ยอดรวม"], command: "summary" },
  { match: ["รายการ", "เอกสาร", "ตรวจสอบ"], command: "draft" },
  { match: ["ลายเซ็น", "เซ็นชื่อ"], command: "signature" },
  { match: ["ช่วย", "ทำอะไรได้", "วิธีใช้", "help"], command: "help" },
];

type Command = "confirm" | "new" | "submit" | "summary" | "draft" | "signature" | "help";

export function commandFor(message: string): Command | null {
  const normalised = message.trim().toLowerCase();
  if (!normalised) return null;

  for (const entry of COMMANDS) {
    if (entry.match.some((phrase) => normalised.includes(phrase))) {
      return entry.command;
    }
  }

  return null;
}

export async function handleText(
  user: LineUser,
  lineUserId: string,
  replyToken: string,
  message: string,
): Promise<void> {
  const command = commandFor(message) ?? "help";

  switch (command) {
    case "confirm": {
      const documentId = await currentDocumentId(user.id);
      const { newLines, state } = await processPendingReceipts(user.id, documentId);
      await sendBatched(replyToken, lineUserId, confirmMessages(newLines, state));
      return;
    }

    case "new": {
      const documentId = await startNewDraft(user.id);
      const state = await readDraft(documentId);
      await replyOrPush(replyToken, lineUserId, [
        text("เริ่มเอกสารใหม่แล้ว ส่งรูปใบเสร็จหรือสกรีนช็อตเส้นทางเข้ามาได้เลย"),
        ...(state ? [draftCard(state)] : []),
      ]);
      return;
    }

    case "submit": {
      const documentId = await currentDocumentId(user.id);
      await replyOrPush(replyToken, lineUserId, await submitMessages(user, documentId));
      return;
    }

    case "summary":
      await replyOrPush(replyToken, lineUserId, await summaryMessages(user, 0));
      return;

    case "draft": {
      // Flushed first: "รายการ" is how someone checks what they have sent so
      // far, and a photo still sitting unread would be missing from the very
      // list meant to show everything.
      const documentId = await currentDocumentId(user.id);
      const { state } = await processPendingReceipts(user.id, documentId);
      await replyOrPush(replyToken, lineUserId, [draftCard(state)]);
      return;
    }

    case "signature":
      await replyOrPush(replyToken, lineUserId, [signatureMessage()]);
      return;

    case "help":
      await replyOrPush(replyToken, lineUserId, [text(helpText(user))]);
  }
}

export function helpText(user: LineUser): string {
  const lines = [
    "ระบบเบิกค่าเดินทาง DocuMan",
    "",
    "ส่งรูปใบเสร็จ ตั๋ว สลิปทางด่วน หรือสกรีนช็อตเส้นทางเข้ามาได้เลย ส่งได้หลายรูปติดกัน " +
      "แล้วพิมพ์ “ครบแล้ว” เมื่อส่งครบทุกใบ ระบบจะอ่านข้อมูลทั้งหมดพร้อมกัน",
    "",
    "คำสั่งที่ใช้ได้",
    "• “ครบแล้ว” — อ่านข้อมูลรูปที่ส่งไปทั้งหมด",
    "• “รายการ” — ดูเอกสารที่กำลังรวบรวม",
    "• “ส่งอนุมัติ” — ส่งเอกสารให้ผู้อนุมัติ",
    "• “เริ่มใหม่” — เริ่มเอกสารใบใหม่",
    "• “ลายเซ็น” — บันทึกหรือแก้ไขลายเซ็น",
  ];

  if (isApprover(user)) {
    lines.push("• “สรุป” — ยอดที่อนุมัติในเดือนนี้");
  }

  return lines.join("\n");
}

function signatureMessage(): LineMessage {
  return {
    type: "template",
    altText: "บันทึกลายเซ็น",
    template: {
      type: "buttons",
      text: "ลายเซ็นจะถูกบันทึกไว้ครั้งเดียว และนำไปใช้กับเอกสารทุกใบ แก้ไขภายหลังได้",
      actions: [{ type: "uri", label: "เปิดหน้าลายเซ็น", uri: liffUrl("/liff/signature") }],
    },
  };
}

// ─── Images ───────────────────────────────────────────────────────────────

/**
 * Acknowledges a photo without reading it.
 *
 * Receipts tend to arrive as a burst of several photos in a row, and OCR-ing
 * each one the moment it lands would answer with a running total that reads
 * as though it is double-counting the ones already sent — it is not, but a
 * chat is not where a running total should live mid-upload. So this only
 * stores the photo; every one of them is read together once the user says the
 * burst is over, in `processPendingReceipts`.
 */
export async function handleImage(
  user: LineUser,
  lineUserId: string,
  replyToken: string,
  messageId: string,
): Promise<void> {
  const { pendingCount } = await receiveReceipt({ userId: user.id, messageId });

  await replyOrPush(replyToken, lineUserId, [
    text(
      `รับรูปแล้ว (รอประมวลผล ${pendingCount} ใบ)\n` +
        `ส่งต่อได้เลย หรือพิมพ์ "ครบแล้ว" เมื่อส่งครบทุกใบ`,
    ),
  ]);
}

/** What "ครบแล้ว" answers with, once every waiting photo has been read. */
function confirmMessages(newLines: DraftLine[], state: DraftState): LineMessage[] {
  if (newLines.length === 0) {
    return [text("ไม่มีรูปที่รอประมวลผล ส่งรูปเข้ามาได้เลย")];
  }

  return [
    text(`อ่านข้อมูลแล้ว ${newLines.length} รายการ`),
    ...newLines.map((line) => receiptCard(line, state)),
  ];
}

/** LINE refuses a reply or push carrying more than five messages. */
const LINE_MESSAGE_BATCH = 5;

/**
 * Sends a possibly-long batch of messages, chunked to LINE's limit.
 *
 * A reply token is single-use, so only the first chunk can spend it; anything
 * past five messages — several receipts confirmed at once — goes out as
 * ordinary pushes instead.
 */
async function sendBatched(
  replyToken: string,
  lineUserId: string,
  messages: LineMessage[],
): Promise<void> {
  if (messages.length === 0) return;

  const [first, ...rest] = chunk(messages, LINE_MESSAGE_BATCH);
  await replyOrPush(replyToken, lineUserId, first);

  for (const batch of rest) {
    await push(lineUserId, batch);
  }
}

/** Exported for its own test — batching arithmetic is cheap to get off by one. */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// ─── Buttons ──────────────────────────────────────────────────────────────

export async function handlePostback(
  user: LineUser,
  lineUserId: string,
  replyToken: string,
  data: string,
): Promise<void> {
  const postback = decodePostback(data);

  if (!postback) {
    // Most often an old card tapped after a deploy changed the vocabulary.
    await replyOrPush(replyToken, lineUserId, [
      text("ปุ่มนี้ใช้ไม่ได้แล้ว พิมพ์ “รายการ” เพื่อดูเอกสารล่าสุด"),
    ]);
    return;
  }

  await replyOrPush(replyToken, lineUserId, await postbackMessages(user, postback));
}

async function postbackMessages(
  user: LineUser,
  postback: Postback,
): Promise<LineMessage[]> {
  switch (postback.action) {
    case "submit":
      return submitMessages(user, postback.documentId);

    case "discard": {
      // Deleted rather than kept as an abandoned DRAFT: an empty shell would
      // still be the "most recently touched editable document", and the next
      // photo would land on the claim the user just threw away.
      const deleted = await prisma.expenseDocument.deleteMany({
        where: {
          id: postback.documentId,
          ownerId: user.id,
          status: "DRAFT",
        },
      });

      return [
        text(
          deleted.count > 0
            ? "ยกเลิกเอกสารแล้ว ส่งรูปใหม่เข้ามาเพื่อเริ่มใบถัดไปได้เลย"
            : "เอกสารนี้ยกเลิกไม่ได้แล้ว",
        ),
      ];
    }

    case "remove": {
      const documentId = await removeItem(postback.itemId, user.id);
      const state = await readDraft(documentId);
      return state ? [text("ลบรายการแล้ว"), draftCard(state)] : [text("ลบรายการแล้ว")];
    }

    case "decide":
      if (postback.verdict !== "approve") {
        return [reasonPicker(postback.documentId, postback.verdict)];
      }
      return decide(user, postback.documentId, "approve", null);

    case "reason":
      return decide(user, postback.documentId, postback.verdict, postback.reason);

    case "summary":
      return summaryMessages(user, postback.offset);
  }
}

// ─── The two transitions ──────────────────────────────────────────────────

/**
 * Submits, and tells the approver.
 *
 * The approver's notification is pushed after the fact and its failure is
 * swallowed: the claim is already submitted and visible in their queue, and
 * throwing here would tell the requester their submission failed when it did
 * not.
 */
async function submitMessages(user: LineUser, documentId: string): Promise<LineMessage[]> {
  // A photo sent moments ago and never confirmed must not be silently left
  // out of the claim it was meant for.
  await processPendingReceipts(user.id, documentId);

  let result: Awaited<ReturnType<typeof submitClaim>>;

  try {
    result = await submitClaim(user.id, documentId);
  } catch (error) {
    if (error instanceof ValidationError && error.message === "SIGNATURE_REQUIRED") {
      return [
        text("ยังไม่ได้บันทึกลายเซ็น ต้องเซ็นครั้งแรกก่อนส่งอนุมัติ"),
        signatureMessage(),
      ];
    }
    return [text(messageFor(error))];
  }

  const state = await readDraft(documentId);

  if (result.approverLineUserId) {
    try {
      await push(result.approverLineUserId, [
        approvalRequestCard({
          documentId,
          docNo: result.docNo,
          requesterName: result.requesterName ?? "ผู้จัดทำ",
          itemCount: state?.lines.length ?? 0,
          total: result.total,
        }),
      ]);
    } catch (error) {
      console.error("Could not notify the approver for", documentId, error);
    }
  }

  return [
    text(
      [
        `ส่งอนุมัติแล้ว เลขที่ ${result.docNo ?? "—"}`,
        `ยอดรวม ฿${formatMoney(result.total)}`,
        result.approverLineUserId
          ? `แจ้ง ${result.approverName ?? "ผู้อนุมัติ"} ทางไลน์แล้ว`
          : `รอ ${result.approverName ?? "ผู้อนุมัติ"} พิจารณา (ยังไม่ได้เชื่อมบัญชีไลน์)`,
      ].join("\n"),
    ),
  ];
}

const VERDICT_WORD = {
  approve: "อนุมัติ",
  return: "ส่งกลับให้แก้ไข",
  reject: "ไม่อนุมัติ",
} as const;

/** Records the approver's verdict and tells the requester what it was. */
async function decide(
  user: LineUser,
  documentId: string,
  verdict: "approve" | "return" | "reject",
  reason: string | null,
): Promise<LineMessage[]> {
  const approver = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { signature: true },
  });

  if (verdict === "approve" && !approver.signature?.byteLength) {
    return [
      text("ยังไม่ได้บันทึกลายเซ็นผู้อนุมัติ ต้องเซ็นครั้งแรกก่อนอนุมัติ"),
      signatureMessage(),
    ];
  }

  let document: Awaited<ReturnType<typeof decideDocument>>;
  try {
    document = await decideDocument(documentId, user.id, {
      decision: verdict,
      reason,
      comment: null,
      signature:
        verdict === "approve" && approver.signature
          ? toBytes(approver.signature)
          : null,
    });
  } catch (error) {
    return [text(messageFor(error))];
  }

  const owner = await prisma.user.findUnique({
    where: { id: document.ownerId },
    select: { lineUserId: true },
  });

  if (owner?.lineUserId) {
    try {
      await push(owner.lineUserId, [
        text(
          [
            `เอกสาร ${document.docNo ?? ""} ${VERDICT_WORD[verdict]}`.trim(),
            `ยอดรวม ฿${formatMoney(Number(document.totalAmount))}`,
            ...(reason ? [`เหตุผล: ${reason}`] : []),
            ...(verdict === "return"
              ? ["แก้ไขแล้วส่งรูปหรือพิมพ์ “ส่งอนุมัติ” เพื่อส่งใหม่ได้เลย"]
              : []),
          ].join("\n"),
        ),
      ]);
    } catch (error) {
      console.error("Could not notify the requester for", documentId, error);
    }
  }

  if (verdict === "approve") {
    await notifyAdmins(document, user.name ?? "ผู้อนุมัติ");
  }

  return [
    text(
      `บันทึกแล้ว: ${VERDICT_WORD[verdict]} เอกสาร ${document.docNo ?? ""} ฿${formatMoney(Number(document.totalAmount))}`.trim(),
    ),
  ];
}

/**
 * Hands the finished document to whoever files it.
 *
 * Approval is the moment it becomes one: both signatures are on it and the
 * status is terminal, so this is the first point at which a PDF would not go
 * stale. The link is pushed without rendering first — Chromium's cold start is
 * seconds and the approver is waiting on this reply — so the file is built by
 * whichever admin opens the link, and cached from then on.
 *
 * Failures are logged and swallowed, as with the other pushes here: the claim
 * is approved either way, and an admin who never got the message can still be
 * sent the link again.
 */
async function notifyAdmins(
  document: Awaited<ReturnType<typeof decideDocument>>,
  approverName: string,
): Promise<void> {
  const admins = await listAdminLineIds();

  if (admins.length === 0) {
    console.warn("No admin has linked LINE; nobody was sent", document.docNo);
    return;
  }

  const { url, expiresAt } = pdfLink(document.id);
  const card = approvedDocumentCard({
    docNo: document.docNo,
    requesterName: document.owner.name ?? "ผู้จัดทำ",
    approverName,
    total: Number(document.totalAmount),
    url,
    expiresAt,
  });

  // One at a time rather than a multicast: an admin who has blocked the OA
  // must not stop the message reaching the others.
  for (const lineUserId of admins) {
    try {
      await push(lineUserId, [card]);
    } catch (error) {
      console.error("Could not send the approved document to an admin", error);
    }
  }
}

// ─── The approver's month ─────────────────────────────────────────────────

async function summaryMessages(user: LineUser, offset: number): Promise<LineMessage[]> {
  if (!isApprover(user)) {
    return [text("สรุปยอดเป็นข้อมูลของผู้อนุมัติ บัญชีนี้ยังไม่ได้รับสิทธิ์นั้น")];
  }

  const approved = await listApprovedByApprover(user.id);
  return [monthSummaryCard(summariseMonth(approved, offset), offset)];
}

// ─── Errors, in the user's words ──────────────────────────────────────────

/**
 * Domain errors already carry a Thai message written for the person reading it,
 * so they are passed through. Anything else is a bug, and says so plainly
 * rather than leaking a stack trace into a chat window.
 */
function messageFor(error: unknown): string {
  if (
    error instanceof ValidationError ||
    error instanceof InvalidStateError ||
    error instanceof NotFoundError ||
    error instanceof ForbiddenError
  ) {
    return error.message;
  }

  console.error("Unexpected failure handling a LINE action", error);
  return "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง";
}
