import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import type { Prisma } from '@prisma/client'
import { idParamSchema, listQuerySchema } from '@astir/validation'
import { PERMISSION, ROLE_PERMISSIONS } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { badRequest, notFound } from '../../lib/errors'
import { buildMeta, sendItem, sendList, toSkipTake } from '../../lib/http'
import { prisma } from '../../lib/prisma'
import { recordActivity, recordAudit } from '../../lib/activity'

/**
 * Accounts, as distinct from employment records.
 *
 * The employees module owns the employment side — position, rate, department —
 * and opens an account as part of hiring. This one owns the account itself,
 * including accounts no employee record points at: a client's portal user
 * exists here and nowhere in /team/employees.
 */
export const usersRouter = Router()

usersRouter.use(authenticate)

const ROLES = Object.keys(ROLE_PERMISSIONS) as [string, ...string[]]

const accountSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  employee: { select: { id: true, position: true } },
  client: { select: { id: true, name: true } }
} satisfies Prisma.UserSelect

/* ------------------------------------------------------------------- self */

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  avatarUrl: z.string().trim().max(500).optional().nullable()
})

/*
 * Declared before /:id, or Express reads "me" as the id and the uuid validator
 * rejects the request before it ever reaches this handler.
 */
usersRouter.patch(
  '/me',
  validate(profileSchema),
  async (req, res, next) => {
    try {
      const id = req.user?.id
      if (!id) throw badRequest('No session')

      const user = await prisma.user.update({
        where: { id },
        data: req.body,
        select: accountSelect
      })
      return sendItem(res, user)
    } catch (err) {
      next(err)
    }
  }
)

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Пароль короче 8 символов').max(200)
})

/**
 * Change your own password.
 *
 * The current one is required even though the session already proves identity:
 * an unattended screen is the ordinary case in a studio, and without this step
 * anyone walking past could lock the owner out of their own account.
 */
usersRouter.post(
  '/me/password',
  validate(passwordSchema),
  async (req, res, next) => {
    try {
      const id = req.user?.id
      if (!id) throw badRequest('No session')

      const user = await prisma.user.findUnique({ where: { id } })
      if (!user) throw notFound('User')

      const matches = await bcrypt.compare(req.body.currentPassword, user.passwordHash)
      if (!matches) throw badRequest('Текущий пароль неверен')

      await prisma.user.update({
        where: { id },
        data: { passwordHash: await bcrypt.hash(req.body.newPassword, 12) }
      })

      await recordAudit({
        actorId: id,
        action: 'user.password_changed',
        entityType: 'User',
        entityId: id,
        ipAddress: req.ip
      })

      return sendItem(res, { changed: true })
    } catch (err) {
      next(err)
    }
  }
)

/* --------------------------------------------------------------- accounts */

const listSchema = listQuerySchema.extend({
  role: z.enum(ROLES).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  /** Accounts with no employment record: client portal users and leftovers. */
  withoutEmployee: z.enum(['true']).optional()
})

usersRouter.get(
  '/',
  requirePermission(PERMISSION.USER_MANAGE),
  validate(listSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<z.infer<typeof listSchema>>(req)
      const { skip, take } = toSkipTake(query.page, query.limit)

      const where: Prisma.UserWhereInput = {}
      if (query.role) where.role = query.role as never
      if (query.isActive) where.isActive = query.isActive === 'true'
      if (query.withoutEmployee) where.employee = { is: null }
      if (query.search) {
        where.OR = [
          { email: { contains: query.search, mode: 'insensitive' } },
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } }
        ]
      }

      const [items, total] = await Promise.all([
        prisma.user.findMany({
          where, skip, take,
          orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
          select: accountSelect
        }),
        prisma.user.count({ where })
      ])

      return sendList(res, items, buildMeta(total, query.page, query.limit))
    } catch (err) {
      next(err)
    }
  }
)

const updateAccountSchema = z.object({
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  /** Confirm the address by hand, for a studio whose mail is not wired up. */
  emailVerified: z.boolean().optional()
})

usersRouter.patch(
  '/:id',
  requirePermission(PERMISSION.USER_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateAccountSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const before = await prisma.user.findUnique({ where: { id } })
      if (!before) throw notFound('User')

      /*
       * An administrator must not be able to demote or switch off the account
       * they are signed in with: the result is a system nobody can put back,
       * and it is always a slip rather than an intention.
       */
      if (id === req.user?.id) {
        if (req.body.role && req.body.role !== before.role) {
          throw badRequest('Нельзя сменить роль собственной учётной записи')
        }
        if (req.body.isActive === false) {
          throw badRequest('Нельзя отключить собственную учётную запись')
        }
      }

      const data: Prisma.UserUpdateInput = {}
      if (req.body.role) data.role = req.body.role
      if (req.body.isActive !== undefined) data.isActive = req.body.isActive
      if (req.body.emailVerified !== undefined) {
        data.emailVerifiedAt = req.body.emailVerified ? new Date() : null
      }

      const user = await prisma.user.update({ where: { id }, data, select: accountSelect })

      // Reuses the action names the feed already knows, so an account change
      // reads the same whether it came from here or from the employees screen.
      if (req.body.role && req.body.role !== before.role) {
        await recordActivity({
          actorId: req.user?.id,
          action: 'user.role_changed',
          entityType: 'User',
          entityId: id,
          metadata: { from: before.role, to: req.body.role }
        })
      }
      if (req.body.isActive === false && before.isActive) {
        await recordActivity({
          actorId: req.user?.id,
          action: 'user.deactivated',
          entityType: 'User',
          entityId: id
        })
      }
      await recordAudit({
        actorId: req.user?.id,
        action: 'user.account_updated',
        entityType: 'User',
        entityId: id,
        ipAddress: req.ip,
        metadata: { fields: Object.keys(req.body).join(', ') }
      })

      return sendItem(res, user)
    } catch (err) {
      next(err)
    }
  }
)
