import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

export interface TaskListParams {
  skip: number
  take: number
  search?: string
  projectId?: string
  shotId?: string
  sceneId?: string
  episodeId?: string
  stageId?: string
  status?: string
  priority?: string
  assigneeId?: string
  overdue?: boolean
  archived?: boolean
  sort: string
  order: 'asc' | 'desc'
}

const SORTABLE = new Set(['title', 'createdAt', 'deadline', 'status', 'priority'])

export function buildWhere(params: Partial<TaskListParams>): Prisma.TaskWhereInput {
  // Archived tasks drop out of every list unless the archive view asks.
  const where: Prisma.TaskWhereInput = {
    deletedAt: null,
    archivedAt: params.archived ? { not: null } : null
  }
  if (params.projectId) where.projectId = params.projectId
  if (params.shotId) where.shotId = params.shotId
  if (params.sceneId) where.sceneId = params.sceneId
  if (params.episodeId) where.episodeId = params.episodeId
  if (params.stageId) where.stageId = params.stageId
  if (params.assigneeId) where.assigneeId = params.assigneeId
  if (params.status) where.status = params.status as Prisma.TaskWhereInput['status']
  if (params.priority) where.priority = params.priority as Prisma.TaskWhereInput['priority']
  if (params.overdue) {
    where.deadline = { lt: new Date() }
    where.status = { notIn: ['DONE', 'APPROVED'] }
  }
  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: 'insensitive' } },
      { description: { contains: params.search, mode: 'insensitive' } }
    ]
  }
  return where
}

const INCLUDE = {
  assignee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  reviewer: { select: { id: true, firstName: true, lastName: true } },
  stage: { select: { id: true, name: true, order: true } },
  shot: { select: { id: true, code: true } },
  project: { select: { id: true, code: true, name: true } },
  dependencies: {
    include: {
      dependsOnTask: { select: { id: true, title: true, status: true } }
    }
  },
  _count: { select: { versions: true } }
} satisfies Prisma.TaskInclude

export function findMany(params: TaskListParams) {
  const orderField = SORTABLE.has(params.sort) ? params.sort : 'createdAt'
  return prisma.task.findMany({
    where: buildWhere(params),
    skip: params.skip,
    take: params.take,
    orderBy: { [orderField]: params.order },
    include: INCLUDE
  })
}

export function count(params: Partial<TaskListParams>) {
  return prisma.task.count({ where: buildWhere(params) })
}

/** Single-task lookup ignores the archive filter: an archived task must
 *  still be openable so it can be restored. */
export function findById(id: string) {
  return prisma.task.findFirst({ where: { id, deletedAt: null }, include: INCLUDE })
}

export function softDelete(id: string) {
  return prisma.task.update({ where: { id }, data: { deletedAt: new Date() } })
}

/** Board counts per status, so the Kanban header does not fetch every row. */
export function countByStatus(projectId: string) {
  return prisma.task.groupBy({
    by: ['status'],
    where: { projectId, deletedAt: null },
    _count: { _all: true }
  })
}
