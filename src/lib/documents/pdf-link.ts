import { createHmac, timingSafeEqual } from "node:crypto";

import { appUrl, serverEnv } from "@/lib/env";

/**
 * The link an admin is sent when a claim is approved.
 *
 * A LINE bot cannot attach a file — the message types it may send are text,
 * image, video, audio, sticker, location, imagemap, template and flex, and none
 * of them is a PDF. So the document is delivered as a link, and the link has to
 * carry its own permission: the admin opens it in whatever browser LINE hands
 * them, with no session and no LIFF token.
 *
 * A bare `/api/documents/<id>/pdf` would therefore be a public URL to somebody's
 * expenses, guarded by nothing but the unguessability of a cuid. Instead the
 * link carries an expiry and an HMAC over both it and the document id, so a
 * link cannot be edited to point at a different claim, cannot be extended, and
 * stops working on its own.
 *
 * Signed with `AUTH_SECRET` rather than a key of its own: it is already the
 * secret this deployment keeps, rotating it should invalidate these links too,
 * and a second secret would be a second thing to forget to set.
 */

/**
 * How long a link stays good.
 *
 * Long enough for the claim to be paid and filed — an accounting month plus the
 * slack around it — and short enough that a link forwarded once does not stay
 * live in someone's chat history for years. An admin who needs it again after
 * that can be sent a fresh one.
 */
const LIFETIME_MS = 45 * 24 * 60 * 60 * 1000;

function sign(documentId: string, expiresAt: number): string {
  return createHmac("sha256", serverEnv().AUTH_SECRET)
    .update(`${documentId}.${expiresAt}`)
    .digest("base64url");
}

export type PdfLink = {
  url: string;
  expiresAt: Date;
};

/** An absolute, expiring link to one document's PDF. */
export function pdfLink(documentId: string, now = new Date()): PdfLink {
  const expiresAt = now.getTime() + LIFETIME_MS;
  const params = new URLSearchParams({
    e: String(expiresAt),
    t: sign(documentId, expiresAt),
  });

  return {
    url: `${appUrl()}/api/documents/${documentId}/pdf?${params}`,
    expiresAt: new Date(expiresAt),
  };
}

/** Why a link was refused, so the route can say something useful. */
export type LinkVerdict = "ok" | "expired" | "invalid";

/**
 * Checks a link's signature and expiry.
 *
 * Expiry is judged only after the signature holds. Reporting "this expired" for
 * an unsigned link would confirm the document id to someone who guessed it.
 */
export function verifyPdfLink(
  documentId: string,
  expires: string | null,
  token: string | null,
  now = new Date(),
): LinkVerdict {
  if (!expires || !token) return "invalid";

  const expiresAt = Number(expires);
  if (!Number.isSafeInteger(expiresAt)) return "invalid";

  const expected = Buffer.from(sign(documentId, expiresAt), "base64url");

  let received: Buffer;
  try {
    received = Buffer.from(token, "base64url");
  } catch {
    return "invalid";
  }

  // Length first: timingSafeEqual throws on a mismatch rather than returning
  // false.
  if (received.byteLength !== expected.byteLength) return "invalid";
  if (!timingSafeEqual(received, expected)) return "invalid";

  return expiresAt > now.getTime() ? "ok" : "expired";
}
