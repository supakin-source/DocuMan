import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/auth";
import { decodeDataUrl, parseBody, toErrorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/domain/errors";

/** Comfortably above a signature canvas PNG, well below anything abusive. */
const MAX_SIGNATURE_BYTES = 512 * 1024;

const bodySchema = z.object({
  /** PNG data URL from the signature canvas. */
  signature: z.string().min(1),
});

/**
 * Stores a reusable signature on the profile.
 *
 * Documents keep their own copy taken at submit time, so changing this never
 * alters a claim that has already been signed.
 */
export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const { signature } = await parseBody(request, bodySchema);

    const bytes = decodeDataUrl(signature);
    if (bytes.byteLength === 0) {
      throw new ValidationError("ลายเซ็นว่างเปล่า");
    }
    if (bytes.byteLength > MAX_SIGNATURE_BYTES) {
      throw new ValidationError("ไฟล์ลายเซ็นมีขนาดใหญ่เกินไป");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { signature: bytes },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { signature: null },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
