import { google } from "googleapis";

import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";

/**
 * Builds an OAuth2 client authorised as `userId`, using the tokens Auth.js
 * persisted in the Account row at sign-in.
 *
 * The client refreshes the access token on demand; the `tokens` listener writes
 * the refreshed values back so the next request starts from a valid token.
 * Google only issues a refresh token on the first consent, so an existing
 * refresh_token is never overwritten with undefined.
 */
type GoogleOAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export async function googleClientForUser(
  userId: string,
): Promise<GoogleOAuth2Client> {
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

  const env = serverEnv();
  const client = new google.auth.OAuth2({
    clientId: env.AUTH_GOOGLE_ID,
    clientSecret: env.AUTH_GOOGLE_SECRET,
  });

  client.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token,
    // Google's expires_at is in seconds; expiry_date is in milliseconds.
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  client.on("tokens", (tokens) => {
    void prisma.account
      .update({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
        data: {
          ...(tokens.access_token ? { access_token: tokens.access_token } : {}),
          ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
          ...(tokens.expiry_date
            ? { expires_at: Math.floor(tokens.expiry_date / 1000) }
            : {}),
        },
      })
      .catch((error: unknown) => {
        // A failed write is recoverable — the in-memory client still holds the
        // fresh token — so log rather than fail the caller's request.
        console.error("Failed to persist refreshed Google tokens", error);
      });
  });

  return client;
}

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
