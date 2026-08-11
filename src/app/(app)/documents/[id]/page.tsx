import Link from "next/link";

import { requireUser } from "@/auth";
import { CertificateSheet, DetailSheet } from "@/components/document-sheet";
import { DocumentSummary } from "@/components/document-summary";
import { DocumentTimeline } from "@/components/document-timeline";
import { EditIcon } from "@/components/icons";
import { ScreenHeader } from "@/components/screen-header";
import { SheetViewer } from "@/components/sheet-viewer";
import { ExpenseStatus } from "@/generated/prisma/enums";
import { getDocumentFor } from "@/lib/domain/documents";

export const metadata = { title: "เอกสาร · DocuMan" };

/** The requester's view of a submitted document. */
export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  const user = await requireUser();
  const { id } = await params;

  const document = await getDocumentFor(id, user.id);
  const isOwner = document.ownerId === user.id;
  const needsCorrection = document.status === ExpenseStatus.CORRECTION;

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title={document.docNo ?? "เอกสาร"} backHref="/" />

      <div className="no-scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-4 pb-6">
        <DocumentSummary document={document} />
        <DocumentTimeline events={document.timeline} />

        <div className="flex flex-col">
          <h3 className="mb-1.5 text-[11px] font-normal opacity-50">ตัวอย่างเอกสาร</h3>
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

      {isOwner && needsCorrection ? (
        <div className="shrink-0 border-t-2 border-divider px-4 py-3">
          <Link
            href={`/create/${id}/review`}
            className="btn btn-primary btn-block gap-2 border border-transparent"
          >
            <EditIcon />
            แก้ไขข้อมูล
          </Link>
        </div>
      ) : null}
    </div>
  );
}
