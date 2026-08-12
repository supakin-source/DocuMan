import { AppRole } from "@/generated/prisma/enums";

const ALL_ROLES = Object.values(AppRole) as AppRole[];

/**
 * Narrows a single value read out of a JWT claim to a known role.
 *
 * Claims arrive as `unknown` (Auth.js types `JWT` with an index signature) and
 * originate from a client-held cookie, so they are validated rather than cast.
 */
export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && ALL_ROLES.includes(value as AppRole);
}

/** Narrows a JWT claim that should hold a list of roles, dropping anything odd. */
export function toAppRoles(value: unknown): AppRole[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isAppRole);
}

export function hasRole(roles: readonly AppRole[] | undefined, role: AppRole): boolean {
  return roles?.includes(role) ?? false;
}

/** Can create and submit expense documents ("ผู้จัดทำ"). */
export function canRequest(roles: readonly AppRole[] | undefined): boolean {
  return hasRole(roles, AppRole.REQUESTER);
}

/** Can decide on other people's documents ("ผู้อนุมัติ"). */
export function canApprove(roles: readonly AppRole[] | undefined): boolean {
  return hasRole(roles, AppRole.APPROVER);
}

export function isAdmin(roles: readonly AppRole[] | undefined): boolean {
  return hasRole(roles, AppRole.ADMIN);
}

/**
 * Whether the role switcher in the app header should appear at all — it only
 * makes sense for an account that genuinely holds both views.
 */
export function canSwitchRole(roles: readonly AppRole[] | undefined): boolean {
  return canRequest(roles) && canApprove(roles);
}
