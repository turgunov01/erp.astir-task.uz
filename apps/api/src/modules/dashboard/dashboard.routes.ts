import { Router } from 'express'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { sendItem } from '../../lib/http'
import { prisma } from '../../lib/prisma'
import { badRequest, unauthenticated } from '../../lib/errors'
import { activityTaskScope, taskScope } from '../../lib/task-scope'
import { validate, validatedQuery } from '../../middleware/validate'
import { timeline, timelineQuerySchema, type TimelineQuery } from './timeline.service'

/**
 * Dashboard aggregates (spec 7).
 *
 * One endpoint returning every headline number, so the landing page makes a
 * single round trip instead of six. Counts are computed in the database rather
 * than by loading rows and counting in JS.
 */
export const dashboardRouter = Router()

dashboardRouter.use(authenticate)

const ACTIVE_PROJECT_STATUSES = [
  'PLANNING', 'PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION', 'CLIENT_REVIEW', 'DELIVERY'
] as const

/** Coarse pipeline phase, derived from project status (spec 7). */
const PHASE_BY_STATUS: Record<string, string> = {
  DRAFT: 'Препродакшн',
  PLANNING: 'Препродакшн',
  PRE_PRODUCTION: 'Препродакшн',
  PRODUCTION: 'Продакшн',
  POST_PRODUCTION: 'Постпродакшн',
  CLIENT_REVIEW: 'Согласование',
  DELIVERY: 'Поставка'
}

dashboardRouter.get(
  '/stats',
  requirePermission(PERMISSION.DASHBOARD_VIEW),
  async (req, res, next) => {
    try {
      const now = new Date()
      const soon = new Date()
      soon.setDate(soon.getDate() + 14)

      const clientScope = req.user?.role === 'CLIENT'
        ? { clientId: req.user.clientId ?? '00000000-0000-0000-0000-000000000000' }
        : {}

      const projectWhere = { deletedAt: null, ...clientScope }
      if (!req.user) throw unauthenticated()
      const [ownTasks, ownActivity] = await Promise.all([
        taskScope(req.user),
        activityTaskScope(req.user)
      ])

      const [
        activeProjects,
        atRisk,
        overdueTasks,
        pendingReviews,
        activeShots,
        openRevisions,
        projectsByStatus,
        upcoming,
        workload,
        activity
      ] = await Promise.all([
        prisma.project.count({
          where: { ...projectWhere, status: { in: ACTIVE_PROJECT_STATUSES as never } }
        }),
        prisma.project.count({
          where: { ...projectWhere, risk: { in: ['HIGH', 'CRITICAL'] as never } }
        }),
        prisma.task.count({
          where: {
            ...ownTasks,
            deletedAt: null,
            archivedAt: null,
            deadline: { lt: now },
            status: { notIn: ['DONE', 'APPROVED'] }
          }
        }),
        prisma.review.count({ where: { status: { in: ['PENDING', 'IN_REVIEW'] } } }),
        prisma.shot.count({
          where: { deletedAt: null, status: { in: ['IN_PROGRESS', 'REVIEW', 'REVISION'] } }
        }),
        prisma.revision.count({
          where: { status: { in: ['OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW'] } }
        }),
        prisma.project.groupBy({
          by: ['status'],
          where: projectWhere,
          _count: { _all: true }
        }),
        prisma.project.findMany({
          where: { ...projectWhere, deadline: { gte: now, lte: soon } },
          orderBy: { deadline: 'asc' },
          take: 5,
          select: {
            id: true, code: true, name: true, deadline: true,
            progress: true, risk: true, status: true,
            client: { select: { name: true } }
          }
        }),
        prisma.project.findMany({
          where: { ...projectWhere, status: { in: ACTIVE_PROJECT_STATUSES as never } },
          orderBy: { deadline: 'asc' },
          take: 6,
          select: {
            id: true, code: true, name: true, progress: true,
            risk: true, status: true, deadline: true,
            client: { select: { name: true } }
          }
        }),
        prisma.activityLog.findMany({
          where: ownActivity,
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true, action: true, entityType: true, createdAt: true,
            actor: { select: { firstName: true, lastName: true } }
          }
        })
      ])

      // Fold statuses into the five phases the dashboard shows.
      const phases = new Map<string, number>([
        ['Препродакшн', 0], ['Продакшн', 0], ['Постпродакшн', 0],
        ['Согласование', 0], ['Поставка', 0]
      ])
      for (const row of projectsByStatus) {
        const phase = PHASE_BY_STATUS[row.status]
        if (phase) phases.set(phase, (phases.get(phase) ?? 0) + row._count._all)
      }

      return sendItem(res, {
        kpi: {
          activeProjects,
          atRisk,
          overdueTasks,
          pendingReviews,
          activeShots,
          openRevisions
        },
        pipeline: [...phases.entries()].map(([name, count]) => ({ name, count })),
        projects: workload,
        deadlines: upcoming,
        activity
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * Everything with a date, for the calendar.
 *
 * Project deadlines, milestones and task deadlines share one endpoint because
 * the calendar draws them on the same grid; splitting them into three requests
 * would only make the page wait three times.
 */
dashboardRouter.get(
  '/calendar',
  requirePermission(PERMISSION.DASHBOARD_VIEW),
  async (req, res, next) => {
    try {
      const from = req.query.from ? new Date(String(req.query.from)) : new Date()
      const to = req.query.to
        ? new Date(String(req.query.to))
        : new Date(from.getTime() + 90 * 24 * 60 * 60 * 1000)
      const range = { gte: from, lte: to }
      if (!req.user) throw unauthenticated()
      const ownTasks = await taskScope(req.user)

      const [projects, milestones, tasks] = await Promise.all([
        prisma.project.findMany({
          where: { deadline: range },
          select: { id: true, code: true, name: true, deadline: true, status: true },
          orderBy: { deadline: 'asc' }
        }),
        prisma.milestone.findMany({
          where: { dueDate: range },
          select: {
            id: true,
            name: true,
            dueDate: true,
            completedAt: true,
            project: { select: { id: true, code: true } }
          },
          orderBy: { dueDate: 'asc' }
        }),
        prisma.task.findMany({
          where: { ...ownTasks, deadline: range },
          select: {
            id: true,
            title: true,
            deadline: true,
            status: true,
            priority: true,
            project: { select: { id: true, code: true } },
            assignee: { select: { id: true, firstName: true, lastName: true } }
          },
          orderBy: { deadline: 'asc' },
          take: 500
        })
      ])

      return sendItem(res, { projects, milestones, tasks })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * Dated tasks laid out on a time axis, across one project or all of them.
 *
 * Feeds the timeline page's list, chart and Gantt views from one response.
 * Dependencies travel with the tasks so the Gantt can draw its arrows without
 * a second round trip per bar.
 */
dashboardRouter.get(
  '/timeline',
  requirePermission(PERMISSION.PRODUCTION_VIEW),
  validate(timelineQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const user = req.user
      if (!user) throw badRequest('Нет пользователя')
      const query = validatedQuery<TimelineQuery>(req)
      return sendItem(res, await timeline(query, user))
    } catch (err) {
      next(err)
    }
  }
)
