import { NextResponse } from "next/server";

import { requireUser } from "@/auth";
import { toErrorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/domain/errors";
import { extractTravelItem } from "@/lib/ocr/travel";
import { storeAttachment } from "@/lib/storage/attachments";

/** Anything larger is refused before it reaches storage or Gemini. */
const MAX_UPLOAD_BYTES = 18 * 1024 * 1024;

const ACCEPTED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/**
 * Uploads one supporting file to the owner's Drive folder and reads it.
 *
 * Upload and OCR are one call because the design's flow is a single "ยืนยัน"
 * that produces reviewable lines. The extraction is returned alongside the
 * stored attachment and is only ever a suggestion — the next screen exists so
 * the user can correct it before anything is submitted.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/documents/[id]/attachments">,
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const document = await prisma.expenseDocument.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!document) throw new NotFoundError();
    if (document.ownerId !== user.id) throw new ForbiddenError();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("ไม่พบไฟล์ที่อัปโหลด");
    }
    if (file.size === 0) {
      throw new ValidationError("ไฟล์ว่างเปล่า");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ValidationError("ไฟล์มีขนาดเกิน 18 MB");
    }
    if (!ACCEPTED.has(file.type)) {
      throw new ValidationError("รองรับเฉพาะไฟล์ JPG, PNG และ PDF");
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    // Storing and reading the file need nothing from each other, and the user
    // is waiting on both, so they run together rather than end to end.
    //
    // A reading failure must not lose the upload the user already waited for:
    // the attachment stands on its own and the line gets filled in by hand,
    // which is why only the OCR half swallows its error.
    const [attachment, extraction] = await Promise.all([
      storeAttachment({
        documentId: id,
        fileName: file.name,
        mimeType: file.type,
        bytes,
      }),
      extractTravelItem({ bytes, mimeType: file.type }).catch((error: unknown) => {
        console.error("OCR failed for an upload on document", id, error);
        return null;
      }),
    ]);

    return NextResponse.json({ attachment, extraction }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
