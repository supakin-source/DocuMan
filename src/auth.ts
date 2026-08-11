import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";
import { isUserRole } from "@/lib/roles";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      // `user` is only present on the sign-in pass; afterwards the claims below
      // are already on the token.
      if (user) {
        token.sub = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (isUserRole(token.role)) session.user.role = token.role;
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
    throw new Error("Unauthenticated");
  }
  return session.user;
}
