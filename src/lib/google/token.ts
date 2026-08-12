import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Refresh a little early, so a token that is technically still valid when we
 * check cannot expire mid-request.
 */
const EXPIRY_SKEW_SECONDS = 60;

/**
 * Thrown when the stored Google grant can no longer be used and the only fix is
 * for the user to re-authorise. Callers should surface this as a prompt to
 * reconnect Google rather than a generic 500.
 */
export class GoogleReauthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleReauthRequiredError";
  }
}

/** Any non-2xx from a Google API, with the body Google sent back. */
export class GoogleApiError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`Google API returned ${status}: ${body.slice(0, 300)}`);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

/**
 * Returns a usable access token for `userId`, refreshing it if the stored one
 * has expired.
 *
 * Written against the OAuth token endpoint with `fetch` rather than
 * google-auth-library: that package reaches for `child_process`, `fs` and `os`,
 * none of which exist on the Workers runtime this deploys to.
 */
export async function accessTokenFor(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: {
      provider: true,
      providerAccountId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account?.refresh_token) {
    throw new GoogleReauthRequiredError(
      "No Google refresh token on file. The user must sign in again to grant Drive access.",
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    account.access_token &&
    account.expires_at &&
    account.expires_at - EXPIRY_SKEW_SECONDS > nowSeconds
  ) {
    return account.access_token;
  }

  const env = serverEnv();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.AUTH_GOOGLE_ID,
      client_secret: env.AUTH_GOOGLE_SECRET,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    // `invalid_grant` means the user revoked access or the token was replaced;
    // no amount of retrying fixes that, only re-consent.
    if (body.includes("invalid_grant")) {
      throw new GoogleReauthRequiredError(
        "Google rejected the stored refresh token. The user must sign in again.",
      );
    }
    throw new GoogleApiError(response.status, body);
  }

  const refreshed = JSON.parse(body) as {
    access_token: string;
    expires_in: number;
  };

  await prisma.account.update({
    where: {
      provider_providerAccountId: {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      },
    },
    data: {
      access_token: refreshed.access_token,
      expires_at: nowSeconds + refreshed.expires_in,
    },
  });

  return refreshed.access_token;
}

/**
 * Calls a Google API as `userId`, attaching a fresh access token and turning a
 * non-2xx into GoogleApiError.
 */
export async function googleFetch(
  userId: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await accessTokenFor(userId);

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    throw new GoogleApiError(response.status, await response.text());
  }

  return response;
}
