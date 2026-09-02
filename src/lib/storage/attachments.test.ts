import "dotenv/config";

import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import sharp from "sharp";

import { AppRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { createDraft } from "@/lib/domain/documents";
import { readAttachment, storeAttachment } from "@/lib/storage/attachments";

/** A PNG large enough that downscaling has something to do. */
async function wideImage() {
  return sharp({
    create: {
      width: 3000,
      height: 2000,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  })
    .png()
    .toBuffer();
}

let documentId: string;

beforeEach(async () => {
  await prisma.expenseDocument.deleteMany();
  await prisma.documentSequence.deleteMany();
  await prisma.user.updateMany({ data: { approverId: null } });
  await prisma.user.deleteMany();

  const owner = await prisma.user.create({
    data: { email: "staff@assetfive.co.th", roles: [AppRole.REQUESTER] },
    select: { id: true },
  });
  documentId = await createDraft(owner.id);
});

after(async () => {
  await prisma.$disconnect();
});

describe("attachment storage", () => {
  it("stores an image and reads the same bytes back", async () => {
    const stored = await storeAttachment({
      documentId,
      fileName: "receipt.png",
      mimeType: "image/png",
      bytes: await wideImage(),
    });

    const read = await readAttachment(stored.id);

    assert.ok(read, "the stored attachment should be readable");
    assert.equal(read.fileName, "receipt.png");
    assert.equal(read.bytes.byteLength, stored.sizeBytes);
  });

  it("shrinks an oversized photo rather than storing it whole", async () => {
    const original = await wideImage();

    const stored = await storeAttachment({
      documentId,
      fileName: "receipt.png",
      mimeType: "image/png",
      bytes: original,
    });
    const read = await readAttachment(stored.id);

    assert.ok(read);
    // Re-encoded as JPEG at a capped width: the format is what the reader gets
    // told, and the metadata has to agree with the bytes actually kept.
    assert.equal(stored.mimeType, "image/jpeg");
    assert.equal(read.mimeType, "image/jpeg");

    const { width } = await sharp(read.bytes).metadata();
    assert.ok(width && width <= 1600, `expected a capped width, got ${width}`);
    assert.ok(
      stored.sizeBytes < original.byteLength,
      "the stored file should be smaller than the original",
    );
  });

  it("leaves a PDF alone", async () => {
    const pdf = Buffer.from("%PDF-1.4\n%stub\n");

    const stored = await storeAttachment({
      documentId,
      fileName: "toll.pdf",
      mimeType: "application/pdf",
      bytes: pdf,
    });
    const read = await readAttachment(stored.id);

    assert.ok(read);
    assert.equal(read.mimeType, "application/pdf");
    assert.deepEqual(Buffer.from(read.bytes), pdf);
  });

  it("returns null for an attachment whose bytes were never stored here", async () => {
    const orphan = await prisma.attachment.create({
      data: { documentId, fileName: "old.jpg", mimeType: "image/jpeg" },
      select: { id: true },
    });

    assert.equal(await readAttachment(orphan.id), null);
  });

  it("drops the bytes when the document goes", async () => {
    const stored = await storeAttachment({
      documentId,
      fileName: "receipt.png",
      mimeType: "image/png",
      bytes: await wideImage(),
    });

    await prisma.expenseDocument.delete({ where: { id: documentId } });

    assert.equal(
      await prisma.attachmentBlob.findUnique({ where: { attachmentId: stored.id } }),
      null,
    );
  });
});
