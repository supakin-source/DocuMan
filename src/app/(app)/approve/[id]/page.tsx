import { redirect } from "next/navigation";

import { requireUser } from "@/auth";
import { CertificateSheet, DetailSheet } from "@/components/document-sheet";
import { DocumentSummary } from "@/components/document-summary";
import { DocumentTimeline } from "@/components/document-timeline";
import { ScreenHeader } from "@/components/screen-header";
import { SheetViewer } from "@/components/sheet-viewer";
import { ExpenseStatus } from "@/generated/prisma/enums";
import { getDocumentFor } from "@/lib/domain/documents";
import { canApprove } from "@/lib/roles";

export const metadata = { title: "ตรวจสอบเอกสาร · DocuMan" };

import { DecisionActions } from "./decision-actions";

export default async function ApproveDocumentPage({
  params,
}: PageProps<"/approve/[id]">) {
  const user = await requireUser();
  if (!canApprove(user.roles)) redirect("/");

  const { id } = await params;
  const document = await getDocumentFor(id, user.id);

  const isOwnDocument = document.ownerId === user.id;
  const canDecide =
    !isOwnDocument &&
    document.status === ExpenseStatus.PENDING &&
    document.owner.approver?.id === user.id;

  return (
    <div className="relative flex h-full flex-col">
      <ScreenHeader title={document.docNo ?? "เอกสาร"} backHref="/approve" />

      <div className="no-scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-4 pb-6">
        <DocumentSummary document={document} />

        {isOwnDocument ? (
          <div className="border border-divider bg-neutral-100 p-3 text-xs leading-relaxed">
            ไม่สามารถอนุมัติเอกสารของตนเองได้ ·
            เอกสารนี้ต้องได้รับการอนุมัติจากผู้อนุมัติท่านอื่น
          </div>
        ) : null}

        <DocumentTimeline events={document.timeline} />

        <div className="flex flex-col">
          <h3 className="mb-1.5 text-[11px] font-normal opacity-50">เอกสาร</h3>
          <div className="flex h-[420px] flex-col border border-divider">
            <SheetViewer>
              <DetailSheet document={document} />
              {document.includeCertificate ? (
                <CertificateSheet document={document} />
              ) : null}
            </SheetViewer>
          </div>
        </div>
      </div>

      {canDecide ? (
        <DecisionActions
          documentId={id}
          docNo={document.docNo ?? "—"}
          amount={Number(document.totalAmount)}
          approverName={user.name ?? ""}
        />
      ) : null}
    </div>
  );
}
