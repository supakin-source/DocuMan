import sharp from "sharp";

import { prisma } from "@/lib/db";

/**
 * Receipt storage, in Postgres.
 *
 * Files used to live in each user's Google Drive, reached with the refresh
 * token their Google sign-in left behind. The LINE flow has no such sign-in
 * and so no such token, and keeping a second Google integration alive purely
 * to hold a handful of images a month is more machinery than the job needs.
 * The bytes live in `AttachmentBlob` instead — one table, one credential, and
 * a file that is committed or not committed along with the row describing it.
 *
 * What makes that affordable is downscaling: a phone photo of a receipt runs
 * 3-5 MB, which is several times more resolution than the text needs and would
 * spend Neon's free tier inside two years. Re-encoded at the width below it is
 * a few hundred kilobytes, and still legible enough for OCR to read.
 */

/** Wide enough for receipt text to survive; far below a phone camera's output. */
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 80;

export type StoredAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Shrinks an image for storage, leaving anything else alone.
 *
 * Returns the original bytes unchanged when sharp cannot decode the format —
 * its prebuilt binaries ship without HEIF support, and an iPhone photo is
 * exactly the case where that bites. Storing a large original beats refusing
 * an upload the user has already waited for, and Gemini reads HEIC directly.
 */
async function downscale(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (!mimeType.startsWith("image/")) return { bytes, mimeType };

  try {
    const resized = await sharp(bytes)
      .rotate() // Honour the EXIF orientation before it is stripped below.
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    return { bytes: resized, mimeType: "image/jpeg" };
  } catch {
    return { bytes, mimeType };
  }
}

/** Stores one uploaded file against a document and returns its metadata. */
export async function storeAttachment(input: {
  documentId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<StoredAttachment> {
  const file = await downscale(input.bytes, input.mimeType);

  const attachment = await prisma.attachment.create({
    data: {
      documentId: input.documentId,
      fileName: input.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.bytes.byteLength,
      blob: { create: { bytes: Buffer.from(file.bytes) } },
    },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
  });

  return { ...attachment, sizeBytes: attachment.sizeBytes ?? file.bytes.byteLength };
}

/**
 * Reads one stored file back. Null when the attachment is unknown, or when it
 * predates Postgres storage and its bytes are still in a Drive we no longer
 * hold a token for.
 */
export async function readAttachment(
  attachmentId: string,
): Promise<{ bytes: Uint8Array; mimeType: string; fileName: string } | null> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      fileName: true,
      mimeType: true,
      blob: { select: { bytes: true } },
    },
  });

  if (!attachment?.blob) return null;

  return {
    bytes: attachment.blob.bytes,
    mimeType: attachment.mimeType,
    fileName: attachment.fileName,
  };
}
