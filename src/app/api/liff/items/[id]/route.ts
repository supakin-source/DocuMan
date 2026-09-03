import { NextResponse } from "next/server";

import { parseBody, toErrorResponse } from "@/lib/api";
import { getItemFor, updateItem } from "@/lib/domain/documents";
import { expenseItemFieldsSchema } from "@/lib/domain/items";
import { readDraft } from "@/lib/line/claim";
import { requireLiffUser } from "@/lib/line/liff";

/**
 * One expense line, for the screen that corrects what OCR read.
 *
 * The lenient schema is deliberate: this page exists because the model got
 * something wrong or the receipt did not say, and a save that refused a
 * still-incomplete line would trap the user on it. `submitDocument` is where
 * completeness is enforced.
 */

export async function GET(request: Request, { params }: RouteContext<"/api/liff/items/[id]">) {
  try {
    const user = await requireLiffUser(request);
    const { id } = await params;
    const item = await getItemFor(id, user.id);

    return NextResponse.json({
      item: {
        id: item.id,
        type: item.type,
        incurredOn: item.incurredOn.toISOString().slice(0, 10),
        origin: item.origin,
        destination: item.destination,
        purpose: item.purpose,
        distanceKm: item.distanceKm === null ? null : Number(item.distanceKm),
        ratePerKm: item.ratePerKm === null ? null : Number(item.ratePerKm),
        amount: Number(item.amount),
        attachmentId: item.attachment?.id ?? null,
      },
      documentId: item.document.id,
      editable: item.document.status === "DRAFT" || item.document.status === "CORRECTION",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext<"/api/liff/items/[id]">) {
  try {
    const user = await requireLiffUser(request);
    const { id } = await params;
    const input = await parseBody(request, expenseItemFieldsSchema);

    const documentId = await updateItem(id, user.id, input);
    const state = await readDraft(documentId);

    // The running total comes back with the save so the page can show what the
    // claim now stands at without a second round trip.
    return NextResponse.json({
      ok: true,
      total: state?.total ?? 0,
      missing: state?.lines.find((line) => line.id === id)?.missing ?? [],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
