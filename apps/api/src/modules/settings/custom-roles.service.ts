import type { Prisma } from '@prisma/client'
import {
  combinedRoleBase,
  ALL_PERMISSIONS,
  PERMISSION,
  ROLE,
  ROLE_CEILING,
  type AuthUser,
  type Permission,
  type Role
} from '@astir/types'
import type { CreateCustomRoleInput, UpdateCustomRoleInput } from '@astir/validation'
import { prisma } from '../../lib/prisma'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { effectivePermissions, forgetCustomRoles, forgetPermissionMatrix, rolePermissions } from '../../lib/rbac'
import { recordAudit } from '../../lib/activity'
import { t } from '../../i18n'

/**
 * Studio-defined roles: a name, a base role from the enum and a permission
 * list of their own.
 *
 * The rules are the role editor's rules, applied to roles the studio makes
 * up: nobody hands out more than they hold, a role built on the client
 * account stays inside the client ceiling, and nobody edits away their own
 * way back into settings.
 */

/** Who is acting, with what the request needs to audit the change. */
export interface RoleActor {
  user: AuthUser
  ipAddress?: string
}

/**
 * The rank the enum gives a base role where code reads it directly (who may
 * take over whose login). A studio role must not rank its holder above the
 * person who made it.
 */
const BASE_RANK: Partial<Record<Role, number>> = { [ROLE.OWNER]: 3, [ROLE.ADMIN]: 2 }
const baseRank = (role: Role) => BASE_RANK[role] ?? 1

/** The rights a role must keep when the person editing it holds that role. */
const SELF_LOCKOUT_GUARD: readonly Permission[] = [
  PERMISSION.SETTINGS_VIEW,
  PERMISSION.PERMISSION_MANAGE
]

const ROLE_SELECT = {
  baseRoles: true,
  sources: { select: { templateId: true } },
  isTemplate: true,
  baseTemplateId: true,
  id: true,
  name: true,
  description: true,
  baseRole: true,
  permissions: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { users: { where: { deletedAt: null } } } }
} satisfies Prisma.CustomRoleSelect

type RoleRow = Prisma.CustomRoleGetPayload<{ select: typeof ROLE_SELECT }>

function present(row: RoleRow) {
  const { _count, sources, ...role } = row
  return { ...role, baseTemplateIds: sources.map(s => s.templateId), userCount: _count.users }
}

function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value)
}

export async function listCustomRoles(isTemplate = false) {
  const rows = await prisma.customRole.findMany({ where: { isTemplate }, orderBy: { name: 'asc' }, select: ROLE_SELECT })
  return rows.map(present)
}

/**
 * The checks every save goes through.
 *
 * `added` is what the save hands out that the role did not have before: an
 * administrator may still rename a role that holds something they do not, but
 * may not put it there.
 */
async function assertGrantable(
  actor: AuthUser,
  baseRole: Role,
  permissions: readonly string[],
  added: readonly Permission[]
): Promise<Permission[]> {
  const unknown = permissions.filter(p => !isPermission(p))
  if (unknown.length > 0) {
    throw badRequest(t('team.settings.unknownPermissions', { permissions: unknown.join(', ') }))
  }
  const list = [...new Set(permissions as Permission[])]

  if (baseRole === ROLE.OWNER) throw badRequest(t('team.settings.customRoleOwnerBase'))
  if (baseRank(baseRole) > baseRank(actor.role)) {
    throw badRequest(t('team.settings.customRoleBaseOutranks'))
  }

  const own = await effectivePermissions(actor)
  const beyond = added.filter(p => !own.includes(p))
  if (beyond.length > 0) {
    throw badRequest(t('team.settings.beyondOwnRole', { permissions: beyond.join(', ') }))
  }

  const ceiling = ROLE_CEILING[baseRole]
  if (ceiling) {
    const over = list.filter(p => !ceiling.includes(p))
    if (over.length > 0) {
      throw badRequest(t('team.settings.beyondRoleCeiling', { permissions: over.join(', ') }))
    }
  }
  return list
}

/*
 * Compared here rather than with an insensitive query: the database may run
 * under the C locale, which folds only ASCII case, and «Монтажёр» next to
 * «МОНТАЖЁР» is the duplicate this check exists for. A studio has a handful
 * of roles, so reading the names is cheap.
 */
async function assertNameFree(name: string, exceptId?: string, exceptBuiltin?: Role) {
  const wanted = name.toLocaleLowerCase()
  const rows = await prisma.customRole.findMany({ select: { id: true, name: true } })
  const taken = rows.some(row => row.id !== exceptId && row.name.toLocaleLowerCase() === wanted)
  const builtins = await prisma.rolePermission.findMany({ where: { templateDeleted: false, templateName: { not: null } }, select: { role: true, templateName: true } })
  const builtinTaken = builtins.some(row => row.role !== exceptBuiltin && row.templateName?.toLocaleLowerCase() === wanted)
  if (taken || builtinTaken) throw conflict(t('team.settings.roleNameTaken', { name }))
}

async function resolveSources(input: { baseRole: Role, baseRoles?: Role[], baseTemplateIds?: string[], baseTemplateId?: string | null }, selfId?: string) {
  const multi = input.baseRoles !== undefined || input.baseTemplateIds !== undefined
  const baseRoles = [...new Set(input.baseRoles ?? (multi || input.baseTemplateId ? [] : [input.baseRole]))]
  const baseTemplateIds = [...new Set(input.baseTemplateIds ?? (input.baseTemplateId ? [input.baseTemplateId] : []))]
  if (baseTemplateIds.includes(selfId ?? '')) throw notFound('Role template')
  const templates = await prisma.customRole.findMany({ where: { id: { in: baseTemplateIds }, isTemplate: true } })
  if (templates.length !== baseTemplateIds.length || (!multi && templates.some(r => r.baseRole !== input.baseRole))) throw notFound('Role template')
  const deleted = await prisma.rolePermission.findMany({ where: { role: { in: baseRoles }, templateDeleted: true } })
  if (deleted.length) throw notFound('Role template')
  return { baseRoles, baseTemplateIds, baseRole: multi ? combinedRoleBase([...baseRoles, ...templates.map(r => r.baseRole)]) : input.baseRole }
}

/** Names are presentation only; a rename never modifies permissions or identities. */
export async function renameBuiltinTemplate(role: Role, name: string, actor: RoleActor) {
  if (role === ROLE.OWNER) throw badRequest(t('team.settings.customRoleOwnerBase'))
  const before = await prisma.rolePermission.findUnique({ where: { role } })
  if (before?.templateDeleted) throw notFound('Role template')
  await assertNameFree(name, undefined, role)
  const permissions = [...await rolePermissions(role)]
  await prisma.$transaction(async tx => {
    await tx.rolePermission.upsert({ where: { role }, create: { role, permissions, templateName: name }, update: { templateName: name } })
    await recordAudit({ actorId: actor.user.id, action: 'settings.base_role_renamed', entityType: 'Role', ipAddress: actor.ipAddress, metadata: { role, before: before?.templateName ?? null, after: name } }, tx)
  })
  return { role, name }
}

/** Remove a standard permission template, keeping current account permissions. */
export async function deleteBuiltinTemplate(role: Role, actor: RoleActor) {
  if (role === ROLE.OWNER) throw badRequest(t('team.settings.customRoleOwnerBase'))
  const permissions = [...await rolePermissions(role)]
  await prisma.$transaction(async tx => {
    await tx.rolePermission.upsert({ where: { role }, create: { role, permissions, templateDeleted: true }, update: { templateDeleted: true } })
    const derived = await tx.customRole.findMany({ where: { baseRoles: { has: role } }, select: { id: true, baseRoles: true } })
    for (const row of derived) await tx.customRole.update({ where: { id: row.id }, data: { baseRoles: row.baseRoles.filter(r => r !== role) } })
    await recordAudit({ actorId: actor.user.id, action: 'settings.base_role_deleted', entityType: 'Role', ipAddress: actor.ipAddress, metadata: { role } }, tx)
  })
  forgetPermissionMatrix()
}

export async function createCustomRole(input: CreateCustomRoleInput, actor: RoleActor) {
  const sources = input.isTemplate
    ? { baseRole: input.baseRole, baseRoles: [] as Role[], baseTemplateIds: [] as string[] }
    : await resolveSources(input)
  await assertNameFree(input.name)
  const permissions = await assertGrantable(
    actor.user, sources.baseRole, input.permissions, input.permissions.filter(isPermission)
  )

  const role = await prisma.$transaction(async tx => {
    const created = await tx.customRole.create({
      data: {
        isTemplate: input.isTemplate ?? false,
        baseTemplateId: sources.baseTemplateIds[0] ?? null,
        baseRoles: input.isTemplate ? [] : sources.baseRoles,
        sources: { create: sources.baseTemplateIds.map(templateId => ({ templateId })) },
        name: input.name,
        description: input.description ?? null,
        baseRole: sources.baseRole,
        permissions
      },
      select: ROLE_SELECT
    })
    await recordAudit({
      actorId: actor.user.id,
      action: 'settings.custom_role_created',
      entityType: 'CustomRole',
      entityId: created.id,
      ipAddress: actor.ipAddress,
      metadata: { name: created.name, baseRole: created.baseRole, permissions }
    }, tx)
    return created
  })
  forgetCustomRoles()
  return present(role)
}

export async function updateCustomRole(id: string, input: UpdateCustomRoleInput, actor: RoleActor) {
  const before = await prisma.customRole.findUnique({ where: { id } })
  if (!before) throw notFound('Role')

  if (input.name !== undefined) await assertNameFree(input.name, id)

  const changedSources = input.baseRoles !== undefined || input.baseTemplateIds !== undefined || input.baseTemplateId !== undefined
  const sources = changedSources ? await resolveSources({ ...input, baseRole: input.baseRole ?? before.baseRole }, id) : null
  const baseRole = sources?.baseRole ?? input.baseRole ?? before.baseRole
  const requested = input.permissions ?? before.permissions
  const added = requested.filter(isPermission).filter(p => !before.permissions.includes(p))
  const permissions = await assertGrantable(actor.user, baseRole, requested, added)

  if (actor.user.customRoleId === id) {
    const missing = SELF_LOCKOUT_GUARD.filter(p => !permissions.includes(p))
    if (missing.length > 0) throw badRequest(t('team.settings.selfLockout'))
  }

  const role = await prisma.$transaction(async tx => {
    const updated = await tx.customRole.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        baseRole,
        ...(sources ? {
          baseTemplateId: sources.baseTemplateIds[0] ?? null,
          baseRoles: sources.baseRoles,
          sources: { deleteMany: {}, create: sources.baseTemplateIds.map(templateId => ({ templateId })) }
        } : {}),
        permissions
      },
      select: ROLE_SELECT
    })
    // Holders always carry the base role in the enum column, so the checks
    // that read it (portal scoping, ranks) follow the role's new base.
    if (baseRole !== before.baseRole) {
      await tx.user.updateMany({ where: { customRoleId: id }, data: { role: baseRole } })
    }
    // The role's name is its holders' position; a renamed role renames it
    // too, except where somebody has since typed a position of their own.
    if (updated.name !== before.name) {
      await tx.employee.updateMany({
        where: { position: before.name, user: { customRoleId: id } },
        data: { position: updated.name }
      })
    }
    await recordAudit({
      actorId: actor.user.id,
      action: 'settings.custom_role_updated',
      entityType: 'CustomRole',
      entityId: id,
      ipAddress: actor.ipAddress,
      metadata: {
        name: updated.name,
        baseRole: { from: before.baseRole, to: baseRole },
        before: before.permissions,
        after: permissions
      }
    }, tx)
    return updated
  })
  forgetCustomRoles()
  return present(role)
}

/**
 * Remove a role. Its holders keep their accounts and fall back to the base
 * role, which the foreign key does on its own; your own role cannot be removed
 * from under you, for the same reason it cannot be edited out of settings.
 */
export async function deleteCustomRole(id: string, actor: RoleActor) {
  const role = await prisma.customRole.findUnique({ where: { id } })
  if (!role) throw notFound('Role')
  if (actor.user.customRoleId === id) throw badRequest(t('team.settings.customRoleOwnInUse'))

  await prisma.$transaction(async tx => {
    await tx.customRole.delete({ where: { id } })
    await recordAudit({
      actorId: actor.user.id,
      action: 'settings.custom_role_deleted',
      entityType: 'CustomRole',
      entityId: id,
      ipAddress: actor.ipAddress,
      metadata: { name: role.name, baseRole: role.baseRole, permissions: role.permissions }
    }, tx)
  })
  forgetCustomRoles()
}

/** What an account edit asks for: a built-in role, a studio role, or both keys. */
export interface RoleAssignment {
  role?: Role
  customRoleId?: string | null
}

/**
 * Turn an account edit into the two columns it writes.
 *
 * A studio role brings its own base role, whatever `role` says; choosing a
 * built-in role without naming a studio one drops the studio role, because
 * the picker offers one or the other. The person assigning must hold every
 * right the studio role gives — assigning is granting.
 */
export async function resolveRoleAssignment(
  input: RoleAssignment,
  actor: AuthUser
): Promise<{ role?: Role, customRoleId?: string | null }> {
  if (input.customRoleId) {
    const custom = await prisma.customRole.findUnique({ where: { id: input.customRoleId } })
    if (!custom || custom.isTemplate) throw notFound('Role')

    const own = await effectivePermissions(actor)
    const beyond = custom.permissions.filter(isPermission).filter(p => !own.includes(p))
    if (beyond.length > 0) {
      throw badRequest(t('team.settings.customRoleBeyondYours', { permissions: beyond.join(', ') }))
    }
    if (baseRank(custom.baseRole) > baseRank(actor.role)) {
      throw badRequest(t('team.settings.customRoleBaseOutranks'))
    }
    return { role: custom.baseRole, customRoleId: custom.id }
  }
  if (input.customRoleId === null) {
    return { ...(input.role ? { role: input.role } : {}), customRoleId: null }
  }
  if (input.role) return { role: input.role, customRoleId: null }
  return {}
}
