import { notFound } from "next/navigation";

import { DocumentSheet } from "@/components/document-sheet";
import { prisma } from "@/lib/db";
import { verifyPdfLink } from "@/lib/documents/pdf-link";
import { documentInclude } from "@/lib/domain/documents";

/**
 * The sheets alone, for a headless browser to print.
 *
 * Deliberately outside `(app)`: no phone frame, no tab bar, no sign-in. The
 * renderer arrives with no session — it is the deployment fetching itself — so
 * the only thing that can let it in is the same signed, expiring link the admin
 * gets, which is what this checks.
 *
 * Anything the link cannot justify is a 404 rather than a 403. A page that
 * distinguished "wrong signature" from "no such document" would confirm which
 * document ids exist to anyone who guessed one.
 */
export const dynamic = "force-dynamic";

export default async function PrintPage({
  params,
  searchParams,
}: PageProps<"/print/[id]">) {
  const { id } = await params;
  const query = await searchParams;

  const asString = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : null;

  if (verifyPdfLink(id, asString(query.e), asString(query.t)) !== "ok") {
    notFound();
  }

  const document = await prisma.expenseDocument.findUnique({
    where: { id },
    include: documentInclude,
  });

  if (!document) notFound();

  return (
    <div className="bg-white">
      <DocumentSheet document={document} showCertificate={document.includeCertificate} />
    </div>
  );
}
