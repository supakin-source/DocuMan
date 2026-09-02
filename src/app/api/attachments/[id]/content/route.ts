import { requireUser } from "@/auth";
import { toErrorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getDocumentFor } from "@/lib/domain/documents";
import { readAttachment } from "@/lib/storage/attachments";

/**
 * Streams an attachment's bytes.
 *
 * Served through here rather than from a public URL so that the same
 * visibility rules apply to the file as to the document it belongs to — an
 * approver can read a claimant's receipt, a stranger cannot.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/attachments/[id]/content">,
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
      select: { documentId: true },
    });

    if (!attachment) {
      return Response.json({ error: "ไม่พบไฟล์" }, { status: 404 });
    }

    // Throws ForbiddenError unless this user may see the parent document.
    await getDocumentFor(attachment.documentId, user.id);

    const file = await readAttachment(id);
    if (!file) {
      // Known attachment, no bytes: it predates Postgres storage and its file
      // stayed behind in a Drive this app no longer holds a token for.
      return Response.json({ error: "ไฟล์นี้ไม่มีอยู่ในระบบแล้ว" }, { status: 410 });
    }

    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        // Contains personal data; keep it out of shared caches.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
