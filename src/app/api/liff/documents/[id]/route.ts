import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/api";
import { getDocumentFor } from "@/lib/domain/documents";
import { requireLiffUser } from "@/lib/line/liff";

/**
 * A submitted claim, for the approver deciding on it from the chat.
 *
 * `getDocumentFor` is what settles who may see it — the owner, or the approver
 * the owner reports to — so this route adds no rule of its own beyond
 * establishing which LINE account is asking.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/liff/documents/[id]">,
) {
  try {
    const user = await requireLiffUser(request);
    const { id } = await params;
    const document = await getDocumentFor(id, user.id);

    return NextResponse.json({
      id: document.id,
      docNo: document.docNo,
      status: document.status,
      project: document.project,
      description: document.description,
      reason: document.reason,
      total: Number(document.totalAmount),
      submittedAt: document.submittedAt?.toISOString() ?? null,
      decisionReason: document.decisionReason,
      owner: {
        name: document.owner.name,
        position: document.owner.position,
        department: document.owner.department,
        employeeCode: document.owner.employeeCode,
      },
      items: document.items.map((item) => ({
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
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
