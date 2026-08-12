import { redirect } from "next/navigation";

import { requireUser } from "@/auth";
import { CertificateSheet, DetailSheet } from "@/components/document-sheet";
import { ExpenseStatus } from "@/generated/prisma/enums";
import { getDocumentFor } from "@/lib/domain/documents";

import { PreviewScreen } from "./preview-screen";

export const metadata = { title: "ตัวอย่างเอกสาร · DocuMan" };

export default async function PreviewPage({ params }: PageProps<"/create/[id]/preview">) {
  const user = await requireUser();
  const { id } = await params;

  const document = await getDocumentFor(id, user.id);
  if (
    document.status !== ExpenseStatus.DRAFT &&
    document.status !== ExpenseStatus.CORRECTION
  ) {
    redirect(`/documents/${id}`);
  }

  return (
    <PreviewScreen
      documentId={id}
      detail={<DetailSheet document={document} />}
      certificate={<CertificateSheet document={document} />}
    />
  );
}
