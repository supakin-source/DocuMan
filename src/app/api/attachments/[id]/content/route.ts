import { requireUser } from "@/auth";
import { toErrorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getDocumentFor } from "@/lib/domain/documents";
import { downloadFile } from "@/lib/google/drive";

/**
 * Streams an attachment's bytes.
 *
 * Proxied rather than linked directly to Drive so the same visibility rules
 * apply to the file as to the document it belongs to — an approver can read a
 * claimant's receipt, a stranger cannot — and no Drive token reaches the
 * browser. Fetched with the owner's credentials, since the file lives in their
 * Drive and the approver has no access to it.
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
      select: {
        driveFileId: true,
        fileName: true,
        mimeType: true,
        documentId: true,
        document: { select: { ownerId: true } },
      },
    });

    if (!attachment) {
      return Response.json({ error: "ไม่พบไฟล์" }, { status: 404 });
    }

    // Throws ForbiddenError unless this user may see the parent document.
    await getDocumentFor(attachment.documentId, user.id);

    const bytes = await downloadFile(attachment.document.ownerId, attachment.driveFileId);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        // Contains personal data; keep it out of shared caches.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
