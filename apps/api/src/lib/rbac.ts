import {
  ALL_PERMISSIONS,
  ROLE,
  ROLE_PERMISSIONS,
  type Permission,
  type Role
} from '@astir/types'
import { prisma } from './prisma'

/**
 * Effective role permissions: the studio's edits over the compiled defaults.
 *
 * Every request checks a permission, so the table is read once and kept in
 * memory. A save refreshes the copy in this process; the short lifetime covers
 * a second process (a script, a future second worker) picking up someone
 * else's change without a restart.
 */

const CACHE_LIFETIME_MS = 30_000

let matrix: Map<Role, readonly Permission[]> | null = null
let loadedAt = 0

function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value)
}

async function load(): Promise<Map<Role, readonly Permission[]>> {
  const fresh = matrix && Date.now() - loadedAt < CACHE_LIFETIME_MS
  if (matrix && fresh) return matrix

  const rows = await prisma.rolePermission.findMany()
  const next = new Map<Role, readonly Permission[]>()
  for (const row of rows) {
    // A permission that no longer exists in the catalogue is dropped rather
    // than kept as a string nothing checks against.
    next.set(row.role, row.permissions.filter(isPermission))
  }
  matrix = next
  loadedAt = Date.now()
  return next
}

/** What the role may do right now: the stored list, or the defaults. */
export async function effectivePermissions(role: Role): Promise<readonly Permission[]> {
  // The owner is never read from the table: whatever was stored, the owner
  // keeps everything, so nobody can edit the studio into having no owner.
  if (role === ROLE.OWNER) return ROLE_PERMISSIONS[ROLE.OWNER]
  const stored = (await load()).get(role)
  return stored ?? ROLE_PERMISSIONS[role]
}

export async function hasPermission(role: Role, permission: Permission): Promise<boolean> {
  return (await effectivePermissions(role)).includes(permission)
}

/** Every role with its effective list, for the editor. */
export async function permissionMatrix(): Promise<Record<Role, readonly Permission[]>> {
  const out = {} as Record<Role, readonly Permission[]>
  for (const role of Object.values(ROLE)) out[role] = await effectivePermissions(role)
  return out
}

/** Roles whose list differs from the defaults, so the editor can offer a reset. */
export async function customisedRoles(): Promise<Role[]> {
  const stored = await load()
  return [...stored.keys()]
}

export async function saveRolePermissions(role: Role, permissions: Permission[]): Promise<void> {
  const list = [...new Set(permissions)]
  await prisma.rolePermission.upsert({
    where: { role },
    create: { role, permissions: list },
    update: { permissions: list }
  })
  matrix = null
}

export async function resetRolePermissions(role: Role): Promise<void> {
  await prisma.rolePermission.deleteMany({ where: { role } })
  matrix = null
}
