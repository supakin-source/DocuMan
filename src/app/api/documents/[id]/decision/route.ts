import { NextResponse } from "next/server";

import { requireUser } from "@/auth";
import { decodeDataUrl, parseBody, toErrorResponse } from "@/lib/api";
import { decideDocument, decideDocumentSchema } from "@/lib/domain/documents";
import { ForbiddenError } from "@/lib/domain/errors";
import { canApprove } from "@/lib/roles";

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/documents/[id]/decision">,
) {
  try {
    const user = await requireUser();
    if (!canApprove(user.roles)) {
      throw new ForbiddenError("บัญชีของคุณไม่มีสิทธิ์อนุมัติเอกสาร");
    }

    const { id } = await params;
    const { signature, ...input } = await parseBody(request, decideDocumentSchema);

    const document = await decideDocument(id, user.id, {
      ...input,
      signature: signature ? decodeDataUrl(signature) : null,
    });

    return NextResponse.json({ document });
  } catch (error) {
    return toErrorResponse(error);
  }
}
