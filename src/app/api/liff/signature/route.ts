import { NextResponse } from "next/server";
import { z } from "zod";

import { decodeDataUrl, parseBody, toErrorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/domain/errors";
import { requireLiffUser } from "@/lib/line/liff";

/** Comfortably above a signature canvas PNG, well below anything abusive. */
const MAX_SIGNATURE_BYTES = 512 * 1024;

const bodySchema = z.object({
  /** PNG data URL from the signature canvas. */
  signature: z.string().min(1),
});

/** Whether this account has a signature yet, so the page knows what to say. */
export async function GET(request: Request) {
  try {
    const user = await requireLiffUser(request);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { signature: true },
    });

    return NextResponse.json({
      name: user.name,
      hasSignature: Boolean(stored.signature?.byteLength),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Stores the reusable signature.
 *
 * This is the whole of signing in the LINE flow — there is no canvas in a chat
 * window, so a claim is signed with whatever is here at the moment it is
 * submitted. Documents keep their own copy taken then, so redrawing this never
 * alters a claim that has already been signed.
 */
export async function PUT(request: Request) {
  try {
    const user = await requireLiffUser(request);
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
