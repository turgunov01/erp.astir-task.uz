import {
  ALL_PERMISSIONS,
  ROLE,
  ROLE_CEILING,
  ROLE_PERMISSIONS,
  type Permission,
  type Role
} from '@astir/types'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Effective permissions: the studio's edits over the compiled defaults, and
 * the studio's own roles over both.
 *
 * Every request checks a permission, so both tables are read once and kept in
 * memory. A save refreshes the copy in this process; the short lifetime covers
 * a second process (a script, a future second worker) picking up someone
 * else's change without a restart.
 */

const CACHE_LIFETIME_MS = 30_000

/** Whose rights are being asked about: the base role and the studio's role on top. */
export interface PermissionSubject {
  role: Role
  customRoleId: string | null
}

interface CustomRoleRights {
  baseRole: Role
  permissions: readonly Permission[]
}

let matrix: Map<Role, readonly Permission[]> | null = null
let loadedAt = 0

let customRoles: Map<string, CustomRoleRights> | null = null
let customLoadedAt = 0

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

async function loadCustomRoles(): Promise<Map<string, CustomRoleRights>> {
  const fresh = customRoles && Date.now() - customLoadedAt < CACHE_LIFETIME_MS
  if (customRoles && fresh) return customRoles

  const rows = await prisma.customRole.findMany({
    select: { id: true, baseRole: true, permissions: true }
  })
  const next = new Map<string, CustomRoleRights>()
  for (const row of rows) {
    next.set(row.id, {
      baseRole: row.baseRole,
      permissions: capToCeiling(row.baseRole, row.permissions.filter(isPermission))
    })
  }
  customRoles = next
  customLoadedAt = Date.now()
  return next
}

/**
 * A role built on the client role stays inside the client ceiling even if the
 * stored list says otherwise: the portal modules are the only ones that scope
 * their queries to the caller's own client.
 */
function capToCeiling(baseRole: Role, permissions: readonly Permission[]): readonly Permission[] {
  const ceiling = ROLE_CEILING[baseRole]
  return ceiling ? permissions.filter(p => ceiling.includes(p)) : permissions
}

/** What a built-in role may do right now: the stored list, or the defaults. */
export async function rolePermissions(role: Role): Promise<readonly Permission[]> {
  // The owner is never read from the table: whatever was stored, the owner
  // keeps everything, so nobody can edit the studio into having no owner.
  if (role === ROLE.OWNER) return ROLE_PERMISSIONS[ROLE.OWNER]
  const stored = (await load()).get(role)
  return stored ?? ROLE_PERMISSIONS[role]
}

/**
 * What this person may do right now.
 *
 * A studio role replaces the base role's list outright rather than adding to
 * it, so "Монтажёр" built on the artist role can hold less than an artist as
 * well as more. The owner is the owner whatever is attached; a role that was
 * deleted a moment ago falls back to the base role, which is what the foreign
 * key leaves behind anyway.
 */
export async function effectivePermissions(subject: PermissionSubject): Promise<readonly Permission[]> {
  if (subject.role !== ROLE.OWNER && subject.customRoleId) {
    const custom = (await loadCustomRoles()).get(subject.customRoleId)
    if (custom) return custom.permissions
  }
  return rolePermissions(subject.role)
}

export async function hasPermission(subject: PermissionSubject, permission: Permission): Promise<boolean> {
  return (await effectivePermissions(subject)).includes(permission)
}

/** Every role with its effective list, for the editor. */
export async function permissionMatrix(): Promise<Record<Role, readonly Permission[]>> {
  const out = {} as Record<Role, readonly Permission[]>
  for (const role of Object.values(ROLE)) out[role] = await rolePermissions(role)
  return out
}

/** Roles whose list differs from the defaults, so the editor can offer a reset. */
export async function customisedRoles(): Promise<Role[]> {
  const stored = await load()
  return [...stored.keys()]
}

type Writer = Prisma.TransactionClient | typeof prisma

/**
 * Writes take the caller's transaction so the audit row lands with them or
 * not at all; the caller drops the cache once the transaction has committed.
 */
export function saveRolePermissions(
  role: Role,
  permissions: Permission[],
  tx: Writer = prisma
) {
  const list = [...new Set(permissions)]
  return tx.rolePermission.upsert({
    where: { role },
    create: { role, permissions: list },
    update: { permissions: list }
  })
}

export function resetRolePermissions(role: Role, tx: Writer = prisma) {
  return tx.rolePermission.deleteMany({ where: { role } })
}

export function forgetPermissionMatrix() {
  matrix = null
}

/** Called after any write to custom_roles has committed. */
export function forgetCustomRoles() {
  customRoles = null
}
