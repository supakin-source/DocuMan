import "dotenv/config";

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { before, describe, it } from "node:test";

const SECRET = "test-channel-secret";

/**
 * Set before the module loads: `lineEnv()` caches its parse on first call, so a
 * later assignment would not be seen.
 */
process.env.LINE_CHANNEL_SECRET = SECRET;
process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-access-token";

let verifySignature: (rawBody: string, signature: string | null) => boolean;

before(async () => {
  ({ verifySignature } = await import("@/lib/line/client"));
});

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

describe("verifySignature", () => {
  const body = JSON.stringify({
    destination: "U0000",
    events: [{ type: "message", source: { userId: "U1234" } }],
  });

  it("accepts a body signed with the channel secret", () => {
    assert.equal(verifySignature(body, sign(body)), true);
  });

  it("rejects a body that was altered after signing", () => {
    const signature = sign(body);
    const tampered = body.replace("U1234", "U9999");

    assert.equal(verifySignature(tampered, signature), false);
  });

  it("rejects a signature made with a different secret", () => {
    assert.equal(verifySignature(body, sign(body, "someone-elses-secret")), false);
  });

  it("rejects a missing signature", () => {
    assert.equal(verifySignature(body, null), false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    // timingSafeEqual throws on a length mismatch, so the length is checked
    // first; a short signature must read as false rather than crash the route.
    assert.equal(verifySignature(body, Buffer.from("short").toString("base64")), false);
  });

  it("rejects a signature that is not base64 at all", () => {
    assert.equal(verifySignature(body, "!!!not base64!!!"), false);
  });

  it("treats an empty body consistently", () => {
    assert.equal(verifySignature("", sign("")), true);
    assert.equal(verifySignature("", sign("something else")), false);
  });
});
