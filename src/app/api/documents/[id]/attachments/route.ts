import { NextResponse } from "next/server";

import { requireUser } from "@/auth";
import { toErrorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/domain/errors";
import { uploadFile } from "@/lib/google/drive";
import { extractTravelItem } from "@/lib/ocr/travel";

/** Anything larger is refused before it reaches Drive or Gemini. */
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

    const stored = await uploadFile(user.id, {
      name: file.name,
      mimeType: file.type,
      body: bytes,
    });

    const attachment = await prisma.attachment.create({
      data: {
        driveFileId: stored.id,
        fileName: stored.name,
        mimeType: stored.mimeType,
        sizeBytes: stored.size ?? file.size,
        documentId: id,
      },
    });

    // A reading failure must not lose the upload the user already waited for,
    // so the attachment stands on its own and the line is filled in by hand.
    let extraction = null;
    try {
      extraction = await extractTravelItem({ bytes, mimeType: file.type });
    } catch (error) {
      console.error("OCR failed for attachment", attachment.id, error);
    }

    return NextResponse.json({ attachment, extraction }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
