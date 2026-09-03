import { toErrorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getDocumentFor } from "@/lib/domain/documents";
import { requireLiffUser } from "@/lib/line/liff";
import { readAttachment } from "@/lib/storage/attachments";

/**
 * The same receipt bytes as `/api/attachments/[id]/content`, for a caller
 * identified by LINE rather than by a session cookie.
 *
 * Two routes rather than one because the difference is entirely in how the
 * caller proves who they are; the rule about who may read the file is the
 * same one either way, and both get it from `getDocumentFor`.
 *
 * An `<img src>` cannot carry an Authorization header, so the LIFF page fetches
 * these bytes itself and renders the result as a blob URL. That is the cost of
 * not putting receipts behind a guessable public URL.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/liff/attachments/[id]/content">,
) {
  try {
    const user = await requireLiffUser(request);
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
      return Response.json({ error: "ไฟล์นี้ไม่มีอยู่ในระบบแล้ว" }, { status: 410 });
    }

    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
