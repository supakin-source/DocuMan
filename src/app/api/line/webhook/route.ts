import { reply, verifySignature, type LineMessage } from "@/lib/line/client";
import {
  isFollowEvent,
  isMessageEvent,
  isTextMessage,
  type LineEvent,
  type LineWebhookBody,
} from "@/lib/line/events";
import { findUserByLineId } from "@/lib/line/identity";

/**
 * Everything the LINE OA does arrives here.
 *
 * Two rules shape this handler. LINE retries a delivery that does not answer
 * 200, so a failure handling one event must not resend the batch and repeat
 * whatever did succeed — each event is therefore isolated, and the response is
 * 200 regardless. And the signature check is not optional: this URL is public,
 * and without it anyone could post an event claiming to be any user.
 */

export async function POST(request: Request): Promise<Response> {
  // Read as text, not json(): the signature covers the exact bytes sent, and
  // re-serialising a parsed object does not reproduce them.
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("x-line-signature"))) {
    return new Response("Bad signature", { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // LINE's "Verify" button sends an empty event list with a dummy token; there
  // is nothing to do but say yes.
  for (const event of body.events ?? []) {
    try {
      await handleEvent(event);
    } catch (error) {
      console.error("LINE event failed", event.type, error);
    }
  }

  return new Response("OK");
}

async function handleEvent(event: LineEvent): Promise<void> {
  const lineUserId = event.source?.userId;
  const replyToken = event.replyToken;

  // Group and room events carry no user id, and the verification ping carries
  // no usable reply token. Neither is something to act on.
  if (!lineUserId || !replyToken) return;

  const user = await findUserByLineId(lineUserId);

  if (!user) {
    await reply(replyToken, unlinkedMessages(lineUserId));
    return;
  }

  if (isFollowEvent(event)) {
    await reply(replyToken, [text(`ยินดีต้อนรับกลับครับ ${user.name ?? ""}`.trim())]);
    return;
  }

  if (isMessageEvent(event) && isTextMessage(event.message)) {
    await reply(replyToken, [text(helpText())]);
    return;
  }

  // Receipts, buttons and the monthly summary land here once the claim flow is
  // built; until then the bot says what it can do rather than going quiet.
  await reply(replyToken, [text(helpText())]);
}

function text(value: string): LineMessage {
  return { type: "text", text: value };
}

/**
 * Shown to anyone the bot does not recognise. It hands them their own LINE id
 * because that is the one thing they cannot look up themselves and the one
 * thing an admin needs in order to run `pnpm line:link`.
 */
function unlinkedMessages(lineUserId: string): LineMessage[] {
  return [
    text(
      "ยังไม่ได้เชื่อมบัญชีของคุณกับระบบ DocuMan\n" +
        "กรุณาส่งรหัสด้านล่างนี้ให้ผู้ดูแลระบบเพื่อเชื่อมบัญชีให้",
    ),
    text(lineUserId),
  ];
}

function helpText(): string {
  return [
    "ระบบเบิกค่าเดินทาง DocuMan",
    "",
    "ส่งรูปใบเสร็จหรือสกรีนช็อตเส้นทางเข้ามาได้เลย ระบบจะอ่านข้อมูลให้อัตโนมัติ",
    "(ส่วนนี้กำลังพัฒนา จะเปิดใช้งานเร็ว ๆ นี้)",
  ].join("\n");
}
