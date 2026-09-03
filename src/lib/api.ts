import { NextResponse } from "next/server";
import { z } from "zod";

import { UnauthenticatedError } from "@/auth";
import {
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "@/lib/domain/errors";
import { GoogleReauthRequiredError } from "@/lib/google/token";
import { LineApiError } from "@/lib/line/client";
import { LiffNotConfiguredError, LiffUnauthenticatedError } from "@/lib/line/liff";
import { OcrFailedError, UnsupportedDocumentError } from "@/lib/ocr/gemini";

export type ApiError = {
  error: string;
  /** Per-field messages, when the failure came from schema validation. */
  fields?: Record<string, string[]>;
  /** Set when the fix is for the user to reconnect their Google account. */
  reauth?: true;
};

/**
 * Maps a thrown error to a response.
 *
 * Domain errors carry messages already written in Thai for the user; anything
 * else is logged and reported generically, so an internal failure never leaks
 * a stack trace or a query into the response.
 */
export function toErrorResponse(error: unknown): NextResponse<ApiError> {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }
  if (error instanceof LiffUnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  // Both of these used to fall through to the generic 500 below, which told
  // the person holding the phone to try again — the one thing that cannot
  // help, since neither is theirs to fix. The detail stays in the log; the
  // response says whose problem it is.
  if (error instanceof LiffNotConfiguredError) {
    console.error("LIFF is not configured on this deployment", error);
    return NextResponse.json(
      { error: "ระบบยังตั้งค่า LIFF ไม่ครบ กรุณาแจ้งผู้ดูแลระบบ" },
      { status: 503 },
    );
  }
  if (error instanceof LineApiError) {
    console.error("LINE rejected a call from an API route", error);
    return NextResponse.json(
      {
        error:
          error.status === 403
            ? "LINE ปฏิเสธคำขอ (403) — ตรวจสอบ LINE_LIFF_CHANNEL_ID ว่าตรงกับ Channel ID ของแชนแนลที่สร้าง LIFF app ไว้"
            : `เชื่อมต่อ LINE ไม่สำเร็จ (${error.status}) กรุณาแจ้งผู้ดูแลระบบ`,
      },
      { status: 502 },
    );
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof InvalidStateError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof UnsupportedDocumentError) {
    return NextResponse.json(
      { error: "ไฟล์นี้อ่านไม่ได้ รองรับเฉพาะ JPG, PNG และ PDF ขนาดไม่เกิน 18 MB" },
      { status: 415 },
    );
  }
  if (error instanceof OcrFailedError) {
    console.error("OCR failed", error);
    return NextResponse.json(
      { error: "อ่านข้อมูลจากเอกสารไม่สำเร็จ กรุณากรอกข้อมูลเอง" },
      { status: 502 },
    );
  }
  if (error instanceof GoogleReauthRequiredError) {
    return NextResponse.json(
      { error: "การเชื่อมต่อ Google หมดอายุ กรุณาเข้าสู่ระบบใหม่", reauth: true },
      { status: 401 },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ถูกต้อง", fields: z.flattenError(error).fieldErrors },
      { status: 422 },
    );
  }

  console.error("Unhandled API error", error);
  return NextResponse.json(
    { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" },
    { status: 500 },
  );
}

/** Parses a JSON body against `schema`, throwing ZodError on mismatch. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("รูปแบบข้อมูลไม่ถูกต้อง");
  }
  return schema.parse(raw);
}

/**
 * Decodes a `data:image/png;base64,…` URL, as produced by a signature canvas.
 */
export function decodeDataUrl(dataUrl: string): Uint8Array<ArrayBuffer> {
  const comma = dataUrl.indexOf(",");
  const payload = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  const binary = Buffer.from(payload, "base64");
  const bytes = new Uint8Array(binary.byteLength);
  bytes.set(binary);
  return bytes;
}
