import type { AppRole } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Every role the account holds; a person may be both requester and approver. */
      roles: AppRole[];
    } & DefaultSession["user"];
  }

  interface User {
    roles: AppRole[];
  }
}

// The JWT interface is deliberately not augmented here. `next-auth/jwt` only
// re-exports `@auth/core/jwt`, so `declare module "next-auth/jwt"` silently
// declares a new module instead of extending the real one — and `JWT` already
// extends `Record<string, unknown>`, so custom claims read back as `unknown`.
// src/lib/roles.ts narrows them at the point of use instead.
