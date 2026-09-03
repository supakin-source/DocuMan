import { prisma } from "@/lib/db";
import { ensureDocumentPdf, pdfFileName } from "@/lib/documents/pdf";
import { verifyPdfLink } from "@/lib/documents/pdf-link";

/**
 * The PDF an admin was linked to in LINE.
 *
 * There is no session here and there cannot be one: the link opens in whatever
 * browser LINE hands the admin, on a phone that has never signed into this app.
 * The signed, expiring link is the whole of the permission — see
 * `src/lib/documents/pdf-link.ts` for why that is the shape of it.
 *
 * The file is rendered here if it does not exist yet. Approving pushes the link
 * without waiting on Chromium, so a link can legitimately arrive before its
 * file does, and an admin who opens it immediately should get the document
 * rather than an apology.
 */

/**
 * Chromium's cold start is measured in seconds, and this is the one route that
 * may pay it. Vercel honours this up to whatever the plan allows — 10s on
 * Hobby, which is not enough for a cold render; a first open there may need a
 * retry, and the second one is served from Postgres.
 */
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/documents/[id]/pdf">,
) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;

  const verdict = verifyPdfLink(id, query.get("e"), query.get("t"));

  if (verdict === "expired") {
    // Worth distinguishing: the signature held, so this really was a link we
    // issued, and the admin needs to be told to ask for a fresh one rather
    // than left thinking the document vanished.
    return new Response("ลิงก์นี้หมดอายุแล้ว กรุณาขอลิงก์ใหม่จากผู้อนุมัติ", {
      status: 410,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (verdict !== "ok") {
    return new Response("ไม่พบเอกสาร", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const document = await prisma.expenseDocument.findUnique({
    where: { id },
    select: { docNo: true },
  });

  if (!document) {
    return new Response("ไม่พบเอกสาร", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = await ensureDocumentPdf(id);
  } catch (error) {
    console.error("Could not render the PDF for", id, error);
    return new Response("สร้างไฟล์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const fileName = pdfFileName(document.docNo);

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      // inline so a phone opens it in its own viewer; the file still has a
      // name for whoever saves it.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      // Someone's expenses: never a shared cache, and no proxy copy.
      "Cache-Control": "private, no-store",
    },
  });
}
