import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

/** `serverEnv()` caches on first call, so the secret is set before the import. */
process.env.AUTH_SECRET = "test-auth-secret";
process.env.DATABASE_URL ??= "postgresql://localhost:5432/documan";
process.env.AUTH_GOOGLE_ID ??= "x";
process.env.AUTH_GOOGLE_SECRET ??= "x";
process.env.GOOGLE_GENAI_API_KEY ??= "x";
process.env.APP_URL = "https://documan.example";

type Module = typeof import("@/lib/documents/pdf-link");
let link: Module;

before(async () => {
  link = await import("@/lib/documents/pdf-link");
});

const DOC = "cku1a2b3c4d5e6f7g8h9i0j1k";

/** Pulls the two query parameters back out of a generated link. */
function partsOf(url: string) {
  const query = new URL(url).searchParams;
  return { expires: query.get("e"), token: query.get("t") };
}

describe("pdfLink", () => {
  it("builds an absolute link to this document's PDF", () => {
    const { url } = link.pdfLink(DOC);
    assert.ok(url.startsWith(`https://documan.example/api/documents/${DOC}/pdf?`));
  });

  it("signs a link that verifies", () => {
    const { url } = link.pdfLink(DOC);
    const { expires, token } = partsOf(url);

    assert.equal(link.verifyPdfLink(DOC, expires, token, new Date()), "ok");
  });

  it("expires on its own", () => {
    const now = new Date("2026-09-02T00:00:00.000Z");
    const { url, expiresAt } = link.pdfLink(DOC, now);
    const { expires, token } = partsOf(url);

    const justBefore = new Date(expiresAt.getTime() - 1000);
    const justAfter = new Date(expiresAt.getTime() + 1000);

    assert.equal(link.verifyPdfLink(DOC, expires, token, justBefore), "ok");
    assert.equal(link.verifyPdfLink(DOC, expires, token, justAfter), "expired");
  });
});

describe("verifyPdfLink refuses", () => {
  it("a link edited to point at a different claim", () => {
    // The whole point: the id is inside the signature, so swapping it in the
    // path does not produce a link to someone else's expenses.
    const { url } = link.pdfLink(DOC);
    const { expires, token } = partsOf(url);

    assert.equal(link.verifyPdfLink("some-other-document", expires, token), "invalid");
  });

  it("a link whose expiry was pushed further out", () => {
    const { url } = link.pdfLink(DOC);
    const { token } = partsOf(url);
    const later = String(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

    assert.equal(link.verifyPdfLink(DOC, later, token), "invalid");
  });

  it("a missing signature or expiry", () => {
    const { url } = link.pdfLink(DOC);
    const { expires, token } = partsOf(url);

    assert.equal(link.verifyPdfLink(DOC, expires, null), "invalid");
    assert.equal(link.verifyPdfLink(DOC, null, token), "invalid");
    assert.equal(link.verifyPdfLink(DOC, null, null), "invalid");
  });

  it("an expiry that is not a number", () => {
    const { url } = link.pdfLink(DOC);
    const { token } = partsOf(url);

    assert.equal(link.verifyPdfLink(DOC, "soon", token), "invalid");
    assert.equal(link.verifyPdfLink(DOC, "1e30", token), "invalid");
  });

  it("a signature of the wrong length, without throwing", () => {
    // timingSafeEqual rejects a length mismatch by throwing, so the length is
    // checked first; a short token must read as invalid rather than 500.
    const { url } = link.pdfLink(DOC);
    const { expires } = partsOf(url);

    assert.equal(link.verifyPdfLink(DOC, expires, "abc"), "invalid");
    assert.equal(link.verifyPdfLink(DOC, expires, ""), "invalid");
  });

  it("says invalid rather than expired for an unsigned stale link", () => {
    // Answering "expired" would confirm the document id to someone who only
    // guessed it.
    const past = String(Date.now() - 1000);
    assert.equal(link.verifyPdfLink(DOC, past, "not-a-real-signature"), "invalid");
  });
});
