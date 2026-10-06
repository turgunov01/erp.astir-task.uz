import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { PERMISSION, TASK_STATUS, type Role } from '@astir/types'
import { dateStringSchema, uuidSchema } from '@astir/validation'
import { prisma } from '../../lib/prisma'
import { hasPermission } from '../../lib/rbac'
import { badRequest } from '../../lib/errors'
import { t } from '../../i18n'

/**
 * Data behind the timeline page: dated tasks across one or every project,
 * with the stages and milestones needed to draw them.
 *
 * One response feeds all three views (list, charts, Gantt), so switching view
 * is instant and never refetches.
 */

const STATUSES = Object.values(TASK_STATUS) as [string, ...string[]]

/** Upper bound on bars: beyond this a Gantt is unreadable and the payload heavy. */
export const TIMELINE_TASK_LIMIT = 1000

/** `status=IN_PROGRESS,REVIEW` — a comma list, so it fits in one query param. */
const statusListSchema = z
  .string()
  .trim()
  .transform(value => value.split(',').map(item => item.trim()).filter(Boolean))
  .pipe(z.array(z.enum(STATUSES)).max(STATUSES.length))

export const timelineQuerySchema = z.object({
  projectId: uuidSchema.optional(),
  assigneeId: uuidSchema.optional(),
  status: statusListSchema.optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional()
})

export type TimelineQuery = z.infer<typeof timelineQuerySchema>

interface Viewer {
  id: string
  role: Role
  clientId: string | null
}

const NO_CLIENT = '00000000-0000-0000-0000-000000000000'

/**
 * Who may see what.
 *
 * A client account sees only its own client's projects. Someone who may view
 * only their own tasks (an artist by default) gets their own bars and nobody
 * else's — the same promise the task list makes.
 */
async function viewerScope(viewer: Viewer): Promise<{
  project: Prisma.ProjectWhereInput
  assigneeId: string | null
}> {
  const project: Prisma.ProjectWhereInput = { deletedAt: null }
  if (viewer.role === 'CLIENT') project.clientId = viewer.clientId ?? NO_CLIENT
  const seesAll = await hasPermission(viewer.role, PERMISSION.TASK_VIEW)
  return { project, assigneeId: seesAll ? null : viewer.id }
}

function parseRange(query: TimelineQuery) {
  const from = query.from ? new Date(query.from) : null
  const to = query.to ? new Date(query.to) : null
  if (from && to && from > to) throw badRequest(t('common.errors.periodReversed'))
  return { from, to }
}

/**
 * A task occupies [startDate ?? deadline, deadline ?? startDate]; it belongs
 * to the period when that interval overlaps it.
 */
function overlaps(from: Date | null, to: Date | null): Prisma.TaskWhereInput[] {
  const clauses: Prisma.TaskWhereInput[] = []
  if (to) {
    clauses.push({ OR: [{ startDate: { lte: to } }, { startDate: null, deadline: { lte: to } }] })
  }
  if (from) {
    clauses.push({ OR: [{ deadline: { gte: from } }, { deadline: null, startDate: { gte: from } }] })
  }
  return clauses
}

const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  startDate: true,
  deadline: true,
  projectId: true,
  stageId: true,
  assignee: { select: { id: true, firstName: true, lastName: true } },
  dependencies: { select: { dependsOnTaskId: true } }
} satisfies Prisma.TaskSelect

export async function timeline(query: TimelineQuery, viewer: Viewer) {
  const scope = await viewerScope(viewer)
  const { from, to } = parseRange(query)

  // An explicit assignee filter cannot widen an own-tasks-only viewer.
  const assigneeId = scope.assigneeId ?? query.assigneeId ?? null

  const base: Prisma.TaskWhereInput = {
    deletedAt: null,
    archivedAt: null,
    project: scope.project,
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...(assigneeId ? { assigneeId } : {}),
    ...(query.status && query.status.length > 0
      ? { status: { in: query.status as Prisma.EnumTaskStatusFilter['in'] } }
      : {})
  }

  const dated: Prisma.TaskWhereInput = {
    ...base,
    AND: [
      { OR: [{ startDate: { not: null } }, { deadline: { not: null } }] },
      ...overlaps(from, to)
    ]
  }

  const [rows, undated] = await Promise.all([
    prisma.task.findMany({
      where: dated,
      select: TASK_SELECT,
      orderBy: [{ startDate: 'asc' }, { deadline: 'asc' }, { title: 'asc' }],
      take: TIMELINE_TASK_LIMIT + 1
    }),
    prisma.task.count({ where: { ...base, startDate: null, deadline: null } })
  ])

  const truncated = rows.length > TIMELINE_TASK_LIMIT
  const tasks = truncated ? rows.slice(0, TIMELINE_TASK_LIMIT) : rows

  const projects = await projectsFor(query, scope.project, tasks, assigneeId, from, to)
  return { projects, tasks, undated, truncated, limit: TIMELINE_TASK_LIMIT }
}

/**
 * Projects drawn on the chart: the picked one, or every project a bar belongs
 * to. Without an assignee filter, projects whose only dated thing in the period
 * is a milestone come too — a delivery date is worth seeing on its own.
 */
async function projectsFor(
  query: TimelineQuery,
  scope: Prisma.ProjectWhereInput,
  tasks: Array<{ projectId: string }>,
  assigneeId: string | null,
  from: Date | null,
  to: Date | null
) {
  const dueDate: Prisma.DateTimeNullableFilter = { not: null }
  if (from) dueDate.gte = from
  if (to) dueDate.lte = to

  const taskProjectIds = [...new Set(tasks.map(task => task.projectId))]
  const where: Prisma.ProjectWhereInput = query.projectId
    ? { ...scope, id: query.projectId }
    : assigneeId
      ? { ...scope, id: { in: taskProjectIds } }
      : { ...scope, OR: [{ id: { in: taskProjectIds } }, { milestones: { some: { dueDate } } }] }

  return prisma.project.findMany({
    where,
    orderBy: { code: 'asc' },
    take: 100,
    select: {
      id: true,
      code: true,
      name: true,
      startDate: true,
      deadline: true,
      progress: true,
      stages: {
        orderBy: { order: 'asc' },
        select: { id: true, name: true, order: true }
      },
      milestones: {
        where: { dueDate },
        orderBy: { dueDate: 'asc' },
        select: { id: true, name: true, dueDate: true, completedAt: true }
      }
    }
  })
}
