import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { listQuerySchema, uuidSchema } from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { buildMeta, sendItem, sendList, toSkipTake } from '../../lib/http'
import { prisma } from '../../lib/prisma'
import { unauthenticated } from '../../lib/errors'
import { t } from '../../i18n'
import { activityTaskScope } from '../../lib/task-scope'

export const activityRouter = Router()

activityRouter.use(authenticate)

const activityQuerySchema = listQuerySchema.extend({
  projectId: uuidSchema.optional(),
  actorId: uuidSchema.optional(),
  entityType: z.string().trim().max(40).optional(),
  /**
   * Matches a whole action or a family of them.
   *
   * The feed gets read by prefix far more often than by exact action — "show me
   * everything that happened to tasks" is a question people actually ask, and
   * "task." answers it without naming all six task actions.
   */
  action: z.string().trim().max(60).optional(),
  from: z.string().refine(value => !Number.isNaN(Date.parse(value)), { error: () => t('common.validation.invalidDate') }).optional(),
  to: z.string().refine(value => !Number.isNaN(Date.parse(value)), { error: () => t('common.validation.invalidDate') }).optional()
})

type ActivityQuery = z.infer<typeof activityQuerySchema>

activityRouter.get(
  '/',
  requirePermission(PERMISSION.ACTIVITY_VIEW),
  validate(activityQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<ActivityQuery>(req)
      const { skip, take } = toSkipTake(query.page, query.limit)

      if (!req.user) throw unauthenticated()
      const where: Prisma.ActivityLogWhereInput = { AND: [await activityTaskScope(req.user)] }
      if (query.projectId) where.projectId = query.projectId
      if (query.actorId) where.actorId = query.actorId
      if (query.entityType) where.entityType = query.entityType
      if (query.action) where.action = { startsWith: query.action }
      if (query.from || query.to) {
        where.createdAt = {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          // A bare end date means the whole of that day, not its midnight.
          ...(query.to ? { lte: new Date(new Date(query.to).setHours(23, 59, 59, 999)) } : {})
        }
      }

      const [items, total] = await Promise.all([
        prisma.activityLog.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            projectId: true,
            metadata: true,
            createdAt: true,
            actor: { select: { id: true, firstName: true, lastName: true } }
          }
        }),
        prisma.activityLog.count({ where })
      ])

      /*
       * ActivityLog keeps projectId as a plain column with no relation, so the
       * code has to be looked up rather than included. One query per page beats
       * one per row, and a project deleted since the event was recorded simply
       * has no code — the entry still belongs in the history.
       */
      const projectIds = [...new Set(items.map(row => row.projectId).filter(Boolean))] as string[]
      const projects = projectIds.length > 0
        ? await prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, code: true, name: true }
        })
        : []
      const byId = new Map(projects.map(project => [project.id, project]))

      const rows = items.map(row => ({
        ...row,
        project: row.projectId ? byId.get(row.projectId) ?? null : null
      }))

      return sendList(res, rows, buildMeta(total, query.page, query.limit))
    } catch (err) {
      next(err)
    }
  }
)

/**
 * The values the filters can actually offer.
 *
 * Built from what the log contains rather than from a hard-coded list, so a
 * filter never offers an action that would return nothing, and a new kind of
 * event appears in the dropdown the first time it happens.
 */
activityRouter.get(
  '/facets',
  requirePermission(PERMISSION.ACTIVITY_VIEW),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthenticated()
      // Same visibility as the feed: counts must not reveal events about
      // tasks the caller cannot open.
      const where: Prisma.ActivityLogWhereInput = { AND: [await activityTaskScope(req.user)] }
      const [actions, entityTypes, actorRows] = await Promise.all([
        prisma.activityLog.groupBy({ by: ['action'], where, _count: { _all: true } }),
        prisma.activityLog.groupBy({ by: ['entityType'], where, _count: { _all: true } }),
        prisma.activityLog.groupBy({
          by: ['actorId'],
          where: { AND: [where, { actorId: { not: null } }] },
          _count: { _all: true }
        })
      ])

      /*
       * Authors come from the log itself, keyed by user id like `actorId`.
       * The page used to list employees, whose ids never match a log row,
       * and needed team:view on top of activity:view to do even that.
       */
      const actorIds = actorRows.map(row => row.actorId).filter((id): id is string => Boolean(id))
      const users = actorIds.length > 0
        ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true }
        })
        : []
      const counts = new Map(actorRows.map(row => [row.actorId, row._count._all]))

      return sendItem(res, {
        actors: users
          .map(user => ({
            value: user.id,
            label: `${user.firstName} ${user.lastName}`.trim(),
            count: counts.get(user.id) ?? 0
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        actions: actions
          .map(row => ({ value: row.action, count: row._count._all }))
          .sort((a, b) => a.value.localeCompare(b.value)),
        entityTypes: entityTypes
          .map(row => ({ value: row.entityType, count: row._count._all }))
          .sort((a, b) => a.value.localeCompare(b.value))
      })
    } catch (err) {
      next(err)
    }
  }
)
