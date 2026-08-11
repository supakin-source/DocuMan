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
    // Pages only. API routes are excluded on purpose: this layer answers an
    // anonymous request with a redirect to /login, and a fetch() following that
    // would receive the login page's HTML instead of a 401. The route handlers
    // authenticate themselves through requireUser() and reply with JSON.
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
