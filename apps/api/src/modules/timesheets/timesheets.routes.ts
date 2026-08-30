import { Router } from 'express'
import { z } from 'zod'
import { idParamSchema, listQuerySchema, uuidSchema } from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { forbidden, unauthenticated } from '../../lib/errors'
import { recordActivity } from '../../lib/activity'
import * as service from './timesheets.service'

const dayString = z
  .string()
  .trim()
  .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')

const listSchema = listQuerySchema.extend({
  employeeId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  taskId: uuidSchema.optional(),
  from: dayString.optional(),
  to: dayString.optional(),
  /** Restrict to the caller's own entries, for the "my timesheet" view. */
  mine: z.coerce.boolean().optional()
})

const createSchema = z.object({
  employeeId: uuidSchema.optional(),
  projectId: uuidSchema,
  taskId: uuidSchema.optional().nullable(),
  shotId: uuidSchema.optional().nullable(),
  date: dayString,
  hours: z.coerce.number().min(0.25).max(24),
  description: z.string().trim().max(2000).optional().nullable()
})

const updateSchema = createSchema.partial().omit({ employeeId: true })

/** Roles that only ever see their own hours. */
const OWN_ONLY_ROLES = ['ARTIST', 'CLIENT']

export const timesheetsRouter = Router()

timesheetsRouter.use(authenticate)

/**
 * Whose entries the caller may read.
 *
 * Everyone sees their own; wider access belongs to supervising roles. A request
 * naming someone else is narrowed rather than refused, so the page stays usable
 * and simply shows what the caller is allowed to see.
 */
async function scopeEmployeeId(
  user: { id: string, role: string } | undefined,
  requested?: string,
  mine?: boolean
) {
  if (!user) throw unauthenticated()
  const own = await service.employeeIdForUser(user.id)
  const ownOnly = OWN_ONLY_ROLES.includes(user.role)

  // A user with no employment record has no entries; an id that matches nothing
  // returns an empty list, which is the honest answer.
  const NOTHING = '00000000-0000-4000-8000-000000000000'
  if (mine || ownOnly) return own ?? NOTHING
  return requested
}

timesheetsRouter.get(
  '/',
  requirePermission(PERMISSION.TIMESHEET_VIEW_OWN),
  validate(listSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<Record<string, unknown>>(req)
      const employeeId = await scopeEmployeeId(
        req.user,
        query.employeeId as string | undefined,
        query.mine as boolean | undefined
      )
      const result = await service.list({ ...query, employeeId } as never)
      return sendList(res, result.items, result.meta)
    } catch (err) {
      next(err)
    }
  }
)

timesheetsRouter.get(
  '/summary',
  requirePermission(PERMISSION.TIMESHEET_VIEW_OWN),
  validate(listSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<Record<string, unknown>>(req)
      const employeeId = await scopeEmployeeId(
        req.user,
        query.employeeId as string | undefined,
        query.mine as boolean | undefined
      )
      return sendItem(res, await service.summary({ ...query, employeeId } as never))
    } catch (err) {
      next(err)
    }
  }
)

timesheetsRouter.get(
  '/workload',
  requirePermission(PERMISSION.WORKLOAD_VIEW),
  async (_req, res, next) => {
    try {
      const rows = await service.workload()
      return sendList(res, rows, {
        page: 1, limit: rows.length, total: rows.length, pages: 1
      })
    } catch (err) {
      next(err)
    }
  }
)

timesheetsRouter.get(
  '/:id',
  requirePermission(PERMISSION.TIMESHEET_VIEW_OWN),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.getById(req.params.id as string))
    } catch (err) {
      next(err)
    }
  }
)

timesheetsRouter.post(
  '/',
  requirePermission(PERMISSION.TIMESHEET_SUBMIT),
  validate(createSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthenticated()
      const own = await service.employeeIdForUser(req.user.id)
      const ownOnly = OWN_ONLY_ROLES.includes(req.user.role)

      // Logging hours against someone else is a supervisor action.
      const employeeId = req.body.employeeId && !ownOnly ? req.body.employeeId : own
      if (!employeeId) {
        throw forbidden('Your account has no employment record to log hours against')
      }

      const entry = await service.create({ ...req.body, employeeId })
      await recordActivity({
        actorId: req.user.id,
        entityType: 'TimesheetEntry',
        entityId: entry.id,
        action: 'created',
        projectId: entry.projectId
      })
      return sendItem(res, entry, 201)
    } catch (err) {
      next(err)
    }
  }
)

/** Editing and deleting follow the same rule: your own, unless you supervise. */
async function assertMayModify(
  user: { id: string, role: string } | undefined,
  employeeId: string
) {
  if (!user) throw unauthenticated()
  const own = await service.employeeIdForUser(user.id)
  if (employeeId !== own && OWN_ONLY_ROLES.includes(user.role)) {
    throw forbidden('You can only change your own timesheet entries')
  }
}

timesheetsRouter.patch(
  '/:id',
  requirePermission(PERMISSION.TIMESHEET_SUBMIT),
  validate(idParamSchema, 'params'),
  validate(updateSchema),
  async (req, res, next) => {
    try {
      const existing = await service.getById(req.params.id as string)
      await assertMayModify(req.user, existing.employeeId)
      return sendItem(res, await service.update(req.params.id as string, req.body))
    } catch (err) {
      next(err)
    }
  }
)

timesheetsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.TIMESHEET_SUBMIT),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const existing = await service.getById(req.params.id as string)
      await assertMayModify(req.user, existing.employeeId)
      await service.remove(req.params.id as string)
      await recordActivity({
        actorId: req.user?.id,
        entityType: 'TimesheetEntry',
        entityId: req.params.id as string,
        action: 'deleted',
        projectId: existing.projectId
      })
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)
