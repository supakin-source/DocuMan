import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { allowedEmailDomains } from "@/lib/env";

/**
 * Scopes requested from Google.
 *
 * `drive.file` is deliberately narrow: it grants access only to files DocuMan
 * itself creates or the user explicitly opens with it, never the user's whole
 * Drive. Widening this scope changes what the consent screen asks for and needs
 * a privacy review before it ships.
 */
export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
] as const;

/**
 * Paths reachable without a session. Everything else requires sign-in.
 */
const PUBLIC_PATHS = ["/login", "/auth/error"];

/**
 * Edge-safe half of the Auth.js configuration: no database adapter, no Node-only
 * imports. `middleware.ts` builds its own NextAuth instance from this so that it
 * can run on the edge runtime; `src/auth.ts` extends it with the Prisma adapter.
 */
export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope: GOOGLE_OAUTH_SCOPES.join(" "),
          // Ask for a refresh token so background Drive calls keep working after
          // the one-hour access token expires. Google only returns one when both
          // of these are set.
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    signIn({ profile }) {
      const domains = allowedEmailDomains();
      if (domains.length === 0) return true;

      const email = profile?.email?.toLowerCase();
      if (!email) return false;

      return domains.some((domain) => email.endsWith(`@${domain}`));
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isPublic = PUBLIC_PATHS.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
      );

      if (isPublic) return true;
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;
