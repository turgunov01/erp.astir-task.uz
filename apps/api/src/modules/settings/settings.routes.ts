import { Router } from 'express'
import { z } from 'zod'
import { idParamSchema } from '@astir/validation'
import {
  ALL_PERMISSIONS,
  PERMISSION,
  ROLE,
  ROLE_CEILING,
  ROLE_PERMISSIONS,
  type Permission,
  type Role
} from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import { badRequest, notFound } from '../../lib/errors'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { prisma } from '../../lib/prisma'
import { recordAudit } from '../../lib/activity'
import { sendMail } from '../../lib/mailer'
import { publicStudioSettings, saveStudioSettings, studioSettings } from '../../lib/settings'
import {
  customisedRoles,
  effectivePermissions,
  forgetPermissionMatrix,
  permissionMatrix,
  resetRolePermissions,
  saveRolePermissions
} from '../../lib/rbac'

export const settingsRouter = Router()

/**
 * What the sign-in page may know before anyone is signed in: the name and
 * the logo. Nothing else from the settings row leaves without a session.
 */
settingsRouter.get('/brand', async (_req, res, next) => {
  try {
    const settings = await studioSettings()
    return sendItem(res, { name: settings.name, logoUrl: settings.logoUrl })
  } catch (err) {
    next(err)
  }
})

settingsRouter.use(authenticate)

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable()

const updateSettingsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  legalName: optionalText(200),
  email: optionalText(200),
  phone: optionalText(40),
  website: optionalText(200),
  address: optionalText(400),
  logoUrl: optionalText(500),

  currency: z.string().trim().length(3).toUpperCase().optional(),
  timezone: z.string().trim().max(60).optional(),
  invoicePrefix: z.string().trim().max(10).optional(),

  smtpHost: optionalText(200),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: optionalText(200),
  /*
   * Write-only. An empty string means "clear it"; omitting the field entirely
   * leaves the stored password alone, so saving the rest of the form does not
   * silently wipe credentials the user cannot see in order to retype them.
   */
  smtpPassword: z.string().max(200).optional(),
  smtpFrom: optionalText(200)
})

settingsRouter.get(
  '/',
  requirePermission(PERMISSION.SETTINGS_VIEW),
  async (_req, res, next) => {
    try {
      return sendItem(res, publicStudioSettings(await studioSettings()))
    } catch (err) {
      next(err)
    }
  }
)

settingsRouter.patch(
  '/',
  requirePermission(PERMISSION.SETTINGS_MANAGE),
  validate(updateSettingsSchema),
  async (req, res, next) => {
    try {
      const patch = { ...req.body }
      // An absent password keeps the stored one; a blank one clears it.
      if (patch.smtpPassword === undefined) delete patch.smtpPassword
      else if (patch.smtpPassword === '') patch.smtpPassword = null

      const saved = await saveStudioSettings(patch)

      await recordAudit({
        actorId: req.user?.id,
        action: 'settings.updated',
        entityType: 'StudioSettings',
        // No entityId: the column is a uuid and there is only ever one row,
        // which the entity type already identifies.
        ipAddress: req.ip,
        // Which keys changed, never their values: this row holds credentials.
        metadata: { fields: Object.keys(patch).join(', ') }
      })

      return sendItem(res, publicStudioSettings(saved))
    } catch (err) {
      next(err)
    }
  }
)

/**
 * Prove the SMTP settings actually work.
 *
 * Sent to whoever pressed the button rather than to an address they type in: a
 * test that mails somebody else tells you nothing you can check, and it would
 * turn the settings page into a way to send mail from the studio's address.
 */
settingsRouter.post(
  '/mail/test',
  requirePermission(PERMISSION.SETTINGS_MANAGE),
  async (req, res, next) => {
    try {
      const to = req.user?.email
      if (!to) throw badRequest('Current account has no email address')

      const settings = await studioSettings()
      const result = await sendMail({
        to,
        subject: settings.name + ' — проверка почты',
        text: 'Если вы читаете это письмо, отправка почты из ' + settings.name + ' настроена верно.'
      })

      await recordAudit({
        actorId: req.user?.id,
        action: 'settings.mail_tested',
        entityType: 'StudioSettings',
        ipAddress: req.ip,
        metadata: { delivered: String(result.delivered) }
      })

      return sendItem(res, {
        delivered: result.delivered,
        to,
        // Not an error: without SMTP the message goes to the log on purpose.
        message: result.delivered
          ? 'Письмо отправлено на ' + to
          : 'SMTP не настроен — письмо записано в лог сервера, а не отправлено'
      })
    } catch (err) {
      next(err)
    }
  }
)

/* ------------------------------------------------------ pipeline templates */

const templateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).optional().nullable(),
  stages: z.array(z.string().trim().min(1).max(80)).min(1, 'Нужен хотя бы один этап').max(40),
  isDefault: z.boolean().optional()
})

settingsRouter.get(
  '/templates',
  requirePermission(PERMISSION.SETTINGS_VIEW),
  async (_req, res, next) => {
    try {
      const templates = await prisma.pipelineTemplate.findMany({
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
      })
      return sendList(res, templates, {
        page: 1, limit: templates.length, total: templates.length, pages: 1
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * At most one default.
 *
 * Postgres cannot express "only one row may carry this flag", so it is enforced
 * here: setting it clears the flag everywhere else.
 */
async function clearOtherDefaults(id: string) {
  await prisma.pipelineTemplate.updateMany({
    where: { id: { not: id }, isDefault: true },
    data: { isDefault: false }
  })
}

settingsRouter.post(
  '/templates',
  requirePermission(PERMISSION.SETTINGS_MANAGE),
  validate(templateSchema),
  async (req, res, next) => {
    try {
      const template = await prisma.pipelineTemplate.create({ data: req.body })
      if (template.isDefault) await clearOtherDefaults(template.id)

      await recordAudit({
        actorId: req.user?.id,
        action: 'settings.template_created',
        entityType: 'PipelineTemplate',
        entityId: template.id,
        ipAddress: req.ip,
        metadata: { name: template.name, stages: String(template.stages.length) }
      })

      return sendItem(res, template, 201)
    } catch (err) {
      next(err)
    }
  }
)

settingsRouter.patch(
  '/templates/:id',
  requirePermission(PERMISSION.SETTINGS_MANAGE),
  validate(idParamSchema, 'params'),
  validate(templateSchema.partial()),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const template = await prisma.pipelineTemplate.update({ where: { id }, data: req.body })
      if (template.isDefault) await clearOtherDefaults(id)

      await recordAudit({
        actorId: req.user?.id,
        action: 'settings.template_updated',
        entityType: 'PipelineTemplate',
        entityId: id,
        ipAddress: req.ip,
        metadata: { name: template.name }
      })

      return sendItem(res, template)
    } catch (err) {
      next(err)
    }
  }
)

settingsRouter.delete(
  '/templates/:id',
  requirePermission(PERMISSION.SETTINGS_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const template = await prisma.pipelineTemplate.findUnique({ where: { id } })
      if (!template) throw notFound('PipelineTemplate')

      await prisma.pipelineTemplate.delete({ where: { id } })
      await recordAudit({
        actorId: req.user?.id,
        action: 'settings.template_deleted',
        entityType: 'PipelineTemplate',
        entityId: id,
        ipAddress: req.ip,
        metadata: { name: template.name }
      })

      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

/* ------------------------------------------------------------ permissions */

/** Every role but the owner, whose rights are not up for editing. */
const EDITABLE_ROLES = Object.values(ROLE).filter(role => role !== ROLE.OWNER) as [Role, ...Role[]]

const roleParamSchema = z.object({ role: z.enum(EDITABLE_ROLES) })

const rolePermissionsSchema = z.object({
  permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])).max(ALL_PERMISSIONS.length)
})

/**
 * The rights a role must keep when the person editing it holds that role.
 *
 * Without this an administrator could untick their own access to settings,
 * save, and have no way back in.
 */
const SELF_LOCKOUT_GUARD: readonly Permission[] = [
  PERMISSION.SETTINGS_VIEW,
  PERMISSION.PERMISSION_MANAGE
]

settingsRouter.get(
  '/permissions',
  requirePermission(PERMISSION.SETTINGS_VIEW),
  async (_req, res, next) => {
    try {
      return sendItem(res, {
        roles: await permissionMatrix(),
        defaults: ROLE_PERMISSIONS,
        ceiling: ROLE_CEILING,
        customised: await customisedRoles(),
        catalogue: ALL_PERMISSIONS
      })
    } catch (err) {
      next(err)
    }
  }
)

settingsRouter.put(
  '/permissions/:role',
  requirePermission(PERMISSION.PERMISSION_MANAGE),
  validate(roleParamSchema, 'params'),
  validate(rolePermissionsSchema),
  async (req, res, next) => {
    try {
      const role = req.params.role as Role
      const permissions = req.body.permissions as Permission[]
      if (!req.user) throw badRequest('No session')

      if (req.user.role === role) {
        const missing = SELF_LOCKOUT_GUARD.filter(p => !permissions.includes(p))
        if (missing.length > 0) {
          throw badRequest('Нельзя лишить собственную роль доступа к настройкам и управлению правами')
        }
      }

      /*
       * Nobody hands out more than they hold. The owner holds everything and
       * can delegate anything; an administrator can only pass on rights the
       * administrator role already has, so the editor is never a way up.
       */
      const own = await effectivePermissions(req.user.role)
      const beyond = permissions.filter(p => !own.includes(p))
      if (beyond.length > 0) {
        throw badRequest('Нельзя выдать права, которых нет у вашей роли: ' + beyond.join(', '))
      }

      const ceiling = ROLE_CEILING[role]
      if (ceiling) {
        const over = permissions.filter(p => !ceiling.includes(p))
        if (over.length > 0) {
          throw badRequest('Этой роли нельзя выдать: ' + over.join(', '))
        }
      }

      const before = await effectivePermissions(role)
      await prisma.$transaction(async tx => {
        await saveRolePermissions(role, permissions, tx)
        await recordAudit({
          actorId: req.user?.id,
          action: 'settings.permissions_updated',
          entityType: 'Role',
          ipAddress: req.ip,
          // Roles are enum members, not rows, so the name travels in metadata.
          metadata: { role, before: [...before], after: permissions }
        }, tx)
      })
      forgetPermissionMatrix()

      return sendItem(res, { role, permissions: (await permissionMatrix())[role] })
    } catch (err) {
      next(err)
    }
  }
)

settingsRouter.delete(
  '/permissions/:role',
  requirePermission(PERMISSION.PERMISSION_MANAGE),
  validate(roleParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const role = req.params.role as Role
      const before = await effectivePermissions(role)
      await prisma.$transaction(async tx => {
        await resetRolePermissions(role, tx)
        await recordAudit({
          actorId: req.user?.id,
          action: 'settings.permissions_reset',
          entityType: 'Role',
          ipAddress: req.ip,
          metadata: { role, before: [...before], after: [...ROLE_PERMISSIONS[role]] }
        }, tx)
      })
      forgetPermissionMatrix()
      return sendItem(res, { role, permissions: ROLE_PERMISSIONS[role] })
    } catch (err) {
      next(err)
    }
  }
)
