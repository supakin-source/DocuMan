import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { liffUrl } from "@/lib/env";

/**
 * The bot's buttons are built from these, and a wrong one is only discovered by
 * a person tapping it and landing on a 404 inside LINE.
 */
describe("liffUrl", () => {
  const liffId = "1234567890-abcdefgh";

  function withEnv(env: Record<string, string | undefined>, body: () => void) {
    const previous = { ...process.env };
    Object.assign(process.env, env);
    try {
      body();
    } finally {
      process.env = previous;
    }
  }

  it("strips the /liff prefix already baked into the Endpoint URL", () => {
    // The Endpoint URL is fixed at /liff, and LIFF's own secondary redirect
    // appends whatever follows the LIFF id onto that path — passing the whole
    // absolute path here would land on /liff/liff/signature, a 404, instead
    // of /liff/signature.
    withEnv({ LINE_LIFF_ID: liffId }, () => {
      assert.equal(liffUrl("/liff/signature"), `https://liff.line.me/${liffId}/signature`);
    });
  });

  it("strips the prefix from a nested path too", () => {
    withEnv({ LINE_LIFF_ID: liffId }, () => {
      assert.equal(
        liffUrl("/liff/items/abc"),
        `https://liff.line.me/${liffId}/items/abc`,
      );
    });
  });

  it("tolerates a path given without its leading slash", () => {
    withEnv({ LINE_LIFF_ID: liffId }, () => {
      assert.equal(
        liffUrl("liff/items/abc"),
        `https://liff.line.me/${liffId}/items/abc`,
      );
    });
  });

  it("falls back to the plain app URL when no LIFF app is configured", () => {
    // The link still opens, in the ordinary in-app browser. It just cannot
    // prove who is looking, which is why the pages refuse to act there.
    withEnv({ LINE_LIFF_ID: undefined, APP_URL: "https://documan.example" }, () => {
      assert.equal(liffUrl("/liff/signature"), "https://documan.example/liff/signature");
    });
  });

  it("treats a blank LIFF id as unset rather than building a broken link", () => {
    withEnv({ LINE_LIFF_ID: "   ", APP_URL: "https://documan.example" }, () => {
      assert.equal(liffUrl("/liff/signature"), "https://documan.example/liff/signature");
    });
  });

  it("does not double the slash when APP_URL carries a trailing one", () => {
    withEnv({ LINE_LIFF_ID: undefined, APP_URL: "https://documan.example/" }, () => {
      assert.equal(liffUrl("/liff/signature"), "https://documan.example/liff/signature");
    });
  });
});
