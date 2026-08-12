import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";
import { toAppRoles } from "@/lib/roles";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user, trigger }) {
      // `user` is only present on the sign-in pass; afterwards the claims below
      // are already on the token.
      if (user) {
        token.sub = user.id;
        token.roles = user.roles;
      }
      // Roles are granted by an admin after the account exists, so a token minted
      // at first sign-in would otherwise carry a stale set until it expired.
      if (trigger === "update" && token.sub) {
        token.roles = null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;

      const roles = toAppRoles(token.roles);
      if (roles.length > 0) {
        session.user.roles = roles;
      } else if (token.sub) {
        // Re-read rather than fall back to an empty set: an account with no roles
        // can do nothing, and silently degrading to that is worse than a query.
        const fresh = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { roles: true },
        });
        session.user.roles = fresh?.roles ?? [];
      } else {
        session.user.roles = [];
      }

      return session;
    },
  },
});

/**
 * Returns the signed-in user, or throws. Use in server components and route
 * handlers that must not run anonymously.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthenticatedError();
  }
  return session.user;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
    this.name = "UnauthenticatedError";
  }
}
