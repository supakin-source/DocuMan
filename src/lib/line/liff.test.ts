import "dotenv/config";

import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";

import { AppRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/domain/errors";

/**
 * `liffEnv()` caches its parse on first call, so these must be set before the
 * module is imported below.
 */
process.env.LINE_LIFF_ID = "1234567890-abcdefgh";
process.env.LINE_LOGIN_CHANNEL_ID = "1234567890";

type LiffModule = typeof import("@/lib/line/liff");

let liff: LiffModule;
const realFetch = globalThis.fetch;

async function wipe() {
  // ExpenseDocument holds a foreign key to User, so it goes first.
  await prisma.expenseDocument.deleteMany();
  await prisma.documentSequence.deleteMany();
  await prisma.user.deleteMany();
}

before(async () => {
  liff = await import("@/lib/line/liff");
  await wipe();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

/** Stands in for LINE's verify endpoint, recording what it was sent. */
function stubVerify(response: { status: number; body: unknown }) {
  const calls: { url: string; body: URLSearchParams }[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: new URLSearchParams(String(init?.body ?? "")),
    });

    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  return calls;
}

describe("verifyIdToken", () => {
  it("asks LINE, and reports the user LINE names", async () => {
    const calls = stubVerify({
      status: 200,
      body: { sub: "U1234567890abcdef", name: "ณัฐวุฒิ", aud: "1234567890" },
    });

    assert.deepEqual(await liff.verifyIdToken("a.token.here"), {
      lineUserId: "U1234567890abcdef",
    });

    // The audience is what stops a token minted for a different app being
    // replayed here, so it has to actually be sent.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.line.me/oauth2/v2.1/verify");
    assert.equal(calls[0].body.get("id_token"), "a.token.here");
    assert.equal(calls[0].body.get("client_id"), "1234567890");
  });

  it("returns null for a token LINE rejects", async () => {
    // Expired, or minted for another channel. Ordinary for a page left open on
    // a phone overnight, so it is not an exception.
    stubVerify({ status: 400, body: { error: "invalid_request" } });
    assert.equal(await liff.verifyIdToken("stale.token"), null);

    stubVerify({ status: 401, body: { error: "invalid_client" } });
    assert.equal(await liff.verifyIdToken("wrong.audience"), null);
  });

  it("returns null when LINE answers 200 without naming anyone", async () => {
    stubVerify({ status: 200, body: { name: "somebody" } });
    assert.equal(await liff.verifyIdToken("odd.token"), null);
  });

  it("throws when LINE itself is broken, rather than reading that as a refusal", async () => {
    // A 500 says nothing about the token. Treating it as "not you" would sign
    // people out whenever LINE has a bad minute.
    stubVerify({ status: 503, body: { error: "unavailable" } });
    await assert.rejects(() => liff.verifyIdToken("fine.token"));
  });
});

describe("requireLiffUser", () => {
  function request(headers: Record<string, string> = {}) {
    return new Request("https://example.test/api/liff/signature", { headers });
  }

  it("refuses a request with no Authorization header", async () => {
    await assert.rejects(
      () => liff.requireLiffUser(request()),
      liff.LiffUnauthenticatedError,
    );
  });

  it("refuses a header that is not a bearer token", async () => {
    await assert.rejects(
      () => liff.requireLiffUser(request({ authorization: "Basic abcdef" })),
      liff.LiffUnauthenticatedError,
    );
  });

  it("refuses an empty bearer token without asking LINE", async () => {
    const calls = stubVerify({ status: 200, body: { sub: "U1" } });

    await assert.rejects(
      () => liff.requireLiffUser(request({ authorization: "Bearer " })),
      liff.LiffUnauthenticatedError,
    );
    assert.equal(calls.length, 0);
  });

  it("refuses a token LINE will not vouch for", async () => {
    stubVerify({ status: 400, body: { error: "invalid_request" } });

    await assert.rejects(
      () => liff.requireLiffUser(request({ authorization: "Bearer forged" })),
      liff.LiffUnauthenticatedError,
    );
  });

  it("refuses a real LINE user nobody has linked to an account", async () => {
    // The ID token proves who is holding the phone. It says nothing about
    // whether they work here — that is still the admin's linking step.
    stubVerify({ status: 200, body: { sub: "Ustranger00000000000000000000" } });

    await assert.rejects(
      () => liff.requireLiffUser(request({ authorization: "Bearer valid" })),
      ForbiddenError,
    );
  });

  it("resolves a linked user to their account", async () => {
    const created = await prisma.user.create({
      data: {
        email: "liff-test@assetfive.co.th",
        name: "ณัฐวุฒิ ศรีสุข",
        roles: [AppRole.REQUESTER, AppRole.APPROVER],
        lineUserId: "Ulinked000000000000000000000",
      },
      select: { id: true },
    });

    stubVerify({ status: 200, body: { sub: "Ulinked000000000000000000000" } });

    const user = await liff.requireLiffUser(request({ authorization: "Bearer valid" }));

    assert.equal(user.id, created.id);
    assert.deepEqual(user.roles, [AppRole.REQUESTER, AppRole.APPROVER]);
  });
});
