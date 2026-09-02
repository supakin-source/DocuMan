import { redirect } from "next/navigation";

import { requireUser } from "@/auth";
import { ExpenseStatus } from "@/generated/prisma/enums";
import { getDocumentFor } from "@/lib/domain/documents";
import { isDerivedAmount } from "@/lib/domain/items";

import { ReviewScreen, type EditableItem } from "./review-screen";

export const metadata = { title: "ตรวจสอบข้อมูล · DocuMan" };

export default async function ReviewPage({ params }: PageProps<"/create/[id]/review">) {
  const user = await requireUser();
  const { id } = await params;

  const document = await getDocumentFor(id, user.id);

  // A submitted document is read-only; send the user to the view of it instead
  // of an editor that would fail on save.
  if (document.status !== ExpenseStatus.DRAFT && document.status !== ExpenseStatus.CORRECTION) {
    redirect(`/documents/${id}`);
  }

  const items: EditableItem[] = document.items.map((item) => ({
    key: item.id,
    type: item.type,
    incurredOn: item.incurredOn.toISOString().slice(0, 10),
    origin: item.origin ?? "",
    destination: item.destination ?? "",
    purpose: item.purpose ?? "ไปปฏิบัติงาน",
    distanceKm: item.distanceKm ? String(Number(item.distanceKm)) : "",
    ratePerKm: item.ratePerKm ? String(Number(item.ratePerKm)) : "",
    // Mileage amounts are derived, so the editor leaves that box computed.
    amount: isDerivedAmount(item.type) ? "" : String(Number(item.amount)),
    attachmentId: item.attachment?.id ?? null,
    attachmentIsImage: item.attachment?.mimeType.startsWith("image/") ?? false,
  }));

  return <ReviewScreen documentId={id} initialItems={items} />;
}
