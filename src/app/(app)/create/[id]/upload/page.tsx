import { requireUser } from "@/auth";
import { getDocumentFor } from "@/lib/domain/documents";

import { UploadScreen } from "./upload-screen";

export const metadata = { title: "อัปโหลดข้อมูล · DocuMan" };

export default async function UploadPage({
  params,
}: PageProps<"/create/[id]/upload">) {
  const user = await requireUser();
  const { id } = await params;

  // Throws if the draft is not this user's, so the client screen never renders
  // against a document it may not touch.
  await getDocumentFor(id, user.id);

  return <UploadScreen documentId={id} />;
}
