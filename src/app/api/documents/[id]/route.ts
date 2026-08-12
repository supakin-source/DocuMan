import { NextResponse } from "next/server";

import { requireUser } from "@/auth";
import { parseBody, toErrorResponse } from "@/lib/api";
import {
  getDocumentFor,
  saveDocument,
  saveDocumentSchema,
} from "@/lib/domain/documents";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/documents/[id]">,
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const document = await getDocumentFor(id, user.id);
    return NextResponse.json({ document });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/documents/[id]">,
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(request, saveDocumentSchema);
    await saveDocument(id, user.id, input);
    const document = await getDocumentFor(id, user.id);
    return NextResponse.json({ document });
  } catch (error) {
    return toErrorResponse(error);
  }
}
