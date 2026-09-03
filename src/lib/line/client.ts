import { createHmac, timingSafeEqual } from "node:crypto";

import { lineEnv } from "@/lib/env";

/**
 * The LINE Messaging API, over plain `fetch`.
 *
 * No SDK: the four calls this app makes are one POST each, and @line/bot-sdk
 * brings its own Express-shaped middleware and axios stack for the privilege.
 * The same reasoning as `src/lib/google/drive.ts`.
 */

const API = "https://api.line.me/v2/bot";
/** Message *content* lives on a different host to the rest of the API. */
const DATA_API = "https://api-data.line.me/v2/bot";

export class LineApiError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`LINE API returned ${status}: ${body.slice(0, 300)}`);
    this.name = "LineApiError";
    this.status = status;
  }
}

/**
 * Confirms a webhook delivery really came from LINE.
 *
 * Must be given the raw request body exactly as received — re-serialising
 * parsed JSON changes the bytes and the signature stops matching, so the route
 * reads text() first and parses afterwards.
 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", lineEnv().LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest();

  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64");
  } catch {
    return false;
  }

  // Compared in constant time, and only once the lengths match — timingSafeEqual
  // throws rather than returning false when they differ.
  if (received.byteLength !== expected.byteLength) return false;
  return timingSafeEqual(received, expected);
}

async function call(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lineEnv().LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new LineApiError(response.status, await response.text());
  }
}

/** A LINE message object. Kept loose: Flex payloads are large and structural. */
export type LineMessage = Record<string, unknown>;

/**
 * Answers the event that triggered this webhook. Free, unlike `push`, but the
 * token is single-use and expires shortly after the event, so anything slow
 * enough to miss that window has to push instead.
 */
export function reply(replyToken: string, messages: LineMessage[]): Promise<void> {
  return call("/message/reply", { replyToken, messages });
}

/** Sends to a user outside of any event — an approver being notified, say. */
export function push(to: string, messages: LineMessage[]): Promise<void> {
  return call("/message/push", { to, messages });
}

/**
 * Replies if the token is still good, and pushes if it is not.
 *
 * Reading a receipt takes a few seconds — long enough, on a slow model call or
 * a cold function, to outlive the reply token. Losing the answer entirely at
 * that point would be the worst outcome for the one flow the bot exists for, so
 * the message goes out as a push instead. Pushes are metered where replies are
 * free, which is why this is the fallback and not the default.
 */
export async function replyOrPush(
  replyToken: string,
  userId: string,
  messages: LineMessage[],
): Promise<void> {
  try {
    await reply(replyToken, messages);
  } catch (error) {
    if (!(error instanceof LineApiError) || error.status < 400 || error.status >= 500) {
      throw error;
    }
    console.warn("LINE reply rejected, pushing instead:", error.message);
    await push(userId, messages);
  }
}

/** Downloads what the user actually sent: the photo behind an image message. */
export async function getMessageContent(messageId: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> {
  const response = await fetch(`${DATA_API}/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${lineEnv().LINE_CHANNEL_ACCESS_TOKEN}` },
  });

  if (!response.ok) {
    throw new LineApiError(response.status, await response.text());
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    // LINE serves JPEG for photos but says so in the header rather than the
    // event, so this is the only place the real type is known.
    mimeType: response.headers.get("content-type") ?? "image/jpeg",
  };
}

export type LineProfile = {
  displayName: string;
  pictureUrl?: string;
};

/** The display name to greet someone by before they are linked to an account. */
export async function getProfile(lineUserId: string): Promise<LineProfile | null> {
  const response = await fetch(`${API}/profile/${lineUserId}`, {
    headers: { Authorization: `Bearer ${lineEnv().LINE_CHANNEL_ACCESS_TOKEN}` },
  });

  // 404 is ordinary: someone who has blocked the OA has no profile to read.
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new LineApiError(response.status, await response.text());
  }

  return (await response.json()) as LineProfile;
}
