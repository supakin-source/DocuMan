import { NextResponse } from "next/server";

import { requireUser } from "@/auth";
import { toErrorResponse } from "@/lib/api";
import { createDraft, listOwnDocuments } from "@/lib/domain/documents";

export async function GET() {
  try {
    const user = await requireUser();
    const documents = await listOwnDocuments(user.id);
    return NextResponse.json({ documents });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Starts a new draft and returns its id, which the create flow then builds on. */
export async function POST() {
  try {
    const user = await requireUser();
    const id = await createDraft(user.id);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
