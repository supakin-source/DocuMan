import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Next 16's `proxy` convention, formerly `middleware`.
//
// A second NextAuth instance built from the edge-safe config only: the Prisma
// adapter in src/auth.ts cannot run on the edge runtime, and this layer only
// needs to read the session cookie. Route handlers and server components use
// `auth()` from src/auth.ts, which has the full config.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    // Everything except Next internals, the auth endpoints and static assets.
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
