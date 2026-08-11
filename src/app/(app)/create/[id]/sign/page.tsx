import { redirect } from "next/navigation";

import { requireUser } from "@/auth";
import { ExpenseStatus } from "@/generated/prisma/enums";
import { getDocumentFor } from "@/lib/domain/documents";

import { SignScreen } from "./sign-screen";

export const metadata = { title: "ลงลายเซ็นดิจิทัล · DocuMan" };

export default async function SignPage({ params }: PageProps<"/create/[id]/sign">) {
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
    <SignScreen
      documentId={id}
      name={document.owner.name ?? ""}
      email={document.owner.email}
      total={Number(document.totalAmount)}
    />
  );
}
