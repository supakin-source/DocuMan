import { z } from "zod";

import { ForbiddenError } from "@/lib/domain/errors";
import { LineApiError } from "@/lib/line/client";
import { findUserByLineId, type LineUser } from "@/lib/line/identity";

/**
 * Who is looking at a LIFF page.
 *
 * The bot recognises people by the `userId` LINE stamps on a webhook event,
 * which arrives signed with the channel secret and so cannot be forged. A web
 * page has no such envelope: anything the browser sends is written by the
 * browser, and a page that believed a `?user=` parameter would let anyone sign
 * a document as anyone else.
 *
 * LIFF's answer is an ID token — a JWT LINE issues to the page, naming the
 * person viewing it. This module hands that token back to LINE to be verified
 * rather than checking the signature here: LINE holds the key, decides the
 * token's audience and expiry, and gets the answer right for free.
 *
 * The identity that comes back is only a LINE id. It still has to resolve to an
 * account an admin linked, exactly as the webhook's does — the ID token proves
 * who is holding the phone, not that they work here.
 */

const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

const liffEnvSchema = z.object({
  /** The LIFF app's id, used by the browser to boot the SDK. */
  LINE_LIFF_ID: z.string().min(1, "LINE_LIFF_ID is required"),
  /**
   * Channel id of whichever channel the LIFF app was created under — the
   * Messaging API channel itself when the LIFF app lives on its LIFF tab, which
   * is the simplest arrangement and the one that keeps user ids consistent for
   * free. It is the `aud` LINE checks the token against, which is what stops a
   * token minted for some other app being replayed here.
   */
  LINE_LIFF_CHANNEL_ID: z.string().min(1, "LINE_LIFF_CHANNEL_ID is required"),
});

export type LiffEnv = z.infer<typeof liffEnvSchema>;

let cached: LiffEnv | undefined;

export function liffEnv(): LiffEnv {
  if (cached) return cached;

  const parsed = liffEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.message).join("\n  - ");
    throw new Error(`Invalid LIFF environment:\n  - ${missing}`);
  }

  cached = parsed.data;
  return cached;
}

/** What LINE returns for a token it accepts. Only `sub` is acted on. */
const verifiedSchema = z.object({
  /** The same opaque user id the webhook carries — provided both channels
   * sit under one provider, which is what makes this whole scheme work. */
  sub: z.string().min(1),
  name: z.string().optional(),
});

/**
 * Confirms an ID token really is LINE's, and says who it names.
 *
 * Returns null rather than throwing for a token LINE rejects — expired, replayed
 * from another channel, or simply made up. That is an ordinary thing for a page
 * left open on a phone overnight, and the caller turns it into a 401.
 */
export async function verifyIdToken(idToken: string): Promise<{ lineUserId: string } | null> {
  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: liffEnv().LINE_LIFF_CHANNEL_ID,
    }),
  });

  if (response.status === 400 || response.status === 401) return null;
  if (!response.ok) {
    throw new LineApiError(response.status, await response.text());
  }

  const parsed = verifiedSchema.safeParse(await response.json());
  if (!parsed.success) return null;

  return { lineUserId: parsed.data.sub };
}

/** Raised when the token is absent or LINE will not vouch for it. */
export class LiffUnauthenticatedError extends Error {
  constructor(message = "เซสชันหมดอายุ กรุณาเปิดหน้านี้จากไลน์อีกครั้ง") {
    super(message);
    this.name = "LiffUnauthenticatedError";
  }
}

/**
 * The account behind a LIFF request, or a thrown error explaining which half
 * failed: LINE does not know the token, or nobody has linked the person it
 * names.
 */
export async function requireLiffUser(request: Request): Promise<LineUser> {
  const header = request.headers.get("authorization") ?? "";
  const idToken = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";

  if (!idToken) throw new LiffUnauthenticatedError();

  const verified = await verifyIdToken(idToken);
  if (!verified) throw new LiffUnauthenticatedError();

  const user = await findUserByLineId(verified.lineUserId);
  if (!user) {
    throw new ForbiddenError(
      "ยังไม่ได้เชื่อมบัญชีของคุณกับระบบ กรุณาติดต่อผู้ดูแลระบบ",
    );
  }

  return user;
}
