import { prisma } from "@/lib/db";
import { pdfLink } from "@/lib/documents/pdf-link";
import { NotFoundError } from "@/lib/domain/errors";
import { appUrl } from "@/lib/env";

/**
 * The claim as a file.
 *
 * Rendered by driving a headless Chromium over the app's own print page rather
 * than by building the PDF in JavaScript. The sheets are Thai documents of
 * record: combining marks sit above and below the base letter, and getting them
 * a pixel out is the classic failure of every JS PDF library. A browser already
 * does this correctly, is already how the design's pagination works
 * (`break-inside: avoid` and let the paginator split), and is already the thing
 * these sheets were laid out for.
 *
 * Navigating to the page rather than injecting HTML is what gets the real
 * Tailwind output and the vendored Thai fonts without a second copy of either.
 * The cost is a request the deployment makes to itself, which is why this is
 * cached in Postgres and never on the path of anything a person is waiting on.
 */

/** A4 at 96 dpi, matching `A4_WIDTH` in the sheet component. */
const VIEWPORT_WIDTH = 794;

/**
 * Chromium is slow to start and the render is not.
 *
 * Vercel's Hobby tier caps a function at 10 seconds and a cold Chromium alone
 * spends 3-8 of them, so the first render after a deployment goes idle can lose
 * the race. Everything here is arranged so that losing it costs a retry and
 * nothing else: the claim is already approved, the bytes are cached once they
 * exist, and the link route renders on demand for anyone who opens a link that
 * was sent before the file was ready.
 */
export const PDF_RENDER_TIMEOUT_MS = 45_000;

/** Bytes as Prisma 7 wants them — see `toBytes` in the document service. */
type Bytes = Uint8Array<ArrayBuffer>;

async function launch() {
  // Imported here, not at module scope: @sparticuz/chromium unpacks a ~50 MB
  // binary on first import, and every route that merely mentions a document
  // would otherwise pay for it.
  const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
    import("puppeteer-core"),
    import("@sparticuz/chromium"),
  ]);

  // A local or CI machine has a real browser and no Lambda layer to unpack.
  const local = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();

  return puppeteer.launch({
    args: local ? ["--no-sandbox", "--disable-dev-shm-usage"] : chromium.args,
    executablePath: local || (await chromium.executablePath()),
    headless: true,
  });
}

/**
 * Renders one document and returns the PDF bytes.
 *
 * `waitUntil: "networkidle0"` rather than "load": the sheets embed signatures
 * as data URLs but the letterhead is a real image, and printing before it
 * arrives produces a document with a hole where the logo should be.
 */
export async function renderDocumentPdf(documentId: string): Promise<Bytes> {
  const { url } = pdfLink(documentId);
  const printUrl = `${appUrl()}/print/${documentId}?${new URL(url).searchParams}`;

  const browser = await launch();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: VIEWPORT_WIDTH, height: 1123 });
    await page.goto(printUrl, {
      waitUntil: "networkidle0",
      timeout: PDF_RENDER_TIMEOUT_MS,
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      // The sheets draw their own margins, in the places the paper form has
      // them; a second margin here would inset the whole layout again.
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    const bytes = new Uint8Array(pdf.byteLength);
    bytes.set(pdf);
    return bytes;
  } finally {
    // Closed even when the render threw: a leaked browser outlives the
    // invocation and takes the function's memory with it.
    await browser.close();
  }
}

/**
 * The document's PDF, rendering it once if it has not been rendered yet.
 *
 * Cached in `DocumentPdf` because an approved claim never changes again — the
 * status is terminal, and re-rendering would only spend a cold Chromium to
 * produce the same bytes.
 */
export async function ensureDocumentPdf(documentId: string): Promise<Bytes> {
  const existing = await prisma.documentPdf.findUnique({
    where: { documentId },
    select: { bytes: true },
  });

  if (existing) {
    const bytes = new Uint8Array(existing.bytes.byteLength);
    bytes.set(existing.bytes);
    return bytes;
  }

  const document = await prisma.expenseDocument.findUnique({
    where: { id: documentId },
    select: { id: true },
  });
  if (!document) throw new NotFoundError();

  const bytes = await renderDocumentPdf(documentId);

  // upsert, not create: two admins opening the same link at the same moment
  // both render, and the second must not fail on the unique key.
  await prisma.documentPdf.upsert({
    where: { documentId },
    create: { documentId, bytes: Buffer.from(bytes) },
    update: { bytes: Buffer.from(bytes) },
  });

  return bytes;
}

/** The name the browser saves it under. */
export function pdfFileName(docNo: string | null): string {
  return `${docNo ?? "documan"}.pdf`;
}
