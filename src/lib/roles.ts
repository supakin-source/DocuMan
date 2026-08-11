import { UserRole } from "@/generated/prisma/enums";

const ROLES = Object.values(UserRole) as UserRole[];

/**
 * Narrows a value read out of a JWT claim to a known role.
 *
 * Claims arrive as `unknown` (Auth.js types `JWT` with an index signature) and
 * originate from a client-held cookie, so they are validated rather than cast.
 */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && ROLES.includes(value as UserRole);
}

export function isAdmin(role: UserRole | undefined): boolean {
  return role === UserRole.ADMIN;
}
