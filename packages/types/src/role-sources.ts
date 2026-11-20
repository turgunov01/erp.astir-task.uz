import { ROLE, type Role } from './enums'

/** One system identity for the union: internal selections are not client accounts. */
export function combinedRoleBase(roles: readonly Role[]): Role {
  const priority: Role[] = [ROLE.ADMIN, ROLE.PRODUCER, ROLE.PROJECT_MANAGER, ROLE.ART_DIRECTOR, ROLE.ARTIST, ROLE.FINANCE, ROLE.CLIENT]
  return priority.find(role => roles.includes(role)) ?? ROLE.ARTIST
}
