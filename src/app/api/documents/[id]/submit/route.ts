import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/auth";
import { decodeDataUrl, parseBody, toErrorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { submitDocument } from "@/lib/domain/documents";

const submitSchema = z.object({
  /** PNG data URL from the signature canvas. */
  signature: z.string().min(1, "กรุณาลงลายเซ็น"),
  /** Store the mark on the profile so it can be reused next time. */
  remember: z.boolean().default(false),
});

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/documents/[id]/submit">,
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(request, submitSchema);

    const signature = decodeDataUrl(input.signature);
    const document = await submitDocument(id, user.id, signature);

    if (input.remember) {
      await prisma.user.update({
        where: { id: user.id },
        data: { signature },
      });
    }

    return NextResponse.json({ document });
  } catch (error) {
    return toErrorResponse(error);
  }
}
