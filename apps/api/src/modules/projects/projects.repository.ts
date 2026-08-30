import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { toPrismaProjectType } from './projects.mapper'

export interface ProjectListParams {
  skip: number
  take: number
  search?: string
  status?: string
  projectType?: string
  clientId?: string
  projectManagerId?: string
  priority?: string
  sort: string
  order: 'asc' | 'desc'
}

const SORTABLE = new Set(['name', 'code', 'createdAt', 'deadline', 'progress', 'status'])

export function buildWhere(params: Partial<ProjectListParams>): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = { deletedAt: null }
  if (params.status) where.status = params.status as Prisma.ProjectWhereInput['status']
  if (params.projectType) where.projectType = toPrismaProjectType(params.projectType) as never
  if (params.priority) where.priority = params.priority as Prisma.ProjectWhereInput['priority']
  if (params.clientId) where.clientId = params.clientId
  if (params.projectManagerId) where.projectManagerId = params.projectManagerId
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { code: { contains: params.search, mode: 'insensitive' } }
    ]
  }
  return where
}

const LIST_INCLUDE = {
  client: { select: { id: true, name: true } },
  projectManager: { select: { id: true, firstName: true, lastName: true } },
  producer: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { episodes: true, shots: true, tasks: true } }
} satisfies Prisma.ProjectInclude

export function findMany(params: ProjectListParams) {
  const orderField = SORTABLE.has(params.sort) ? params.sort : 'createdAt'
  return prisma.project.findMany({
    where: buildWhere(params),
    skip: params.skip,
    take: params.take,
    orderBy: { [orderField]: params.order },
    include: LIST_INCLUDE
  })
}

export function count(params: Partial<ProjectListParams>) {
  return prisma.project.count({ where: buildWhere(params) })
}

export function findById(id: string) {
  return prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...LIST_INCLUDE,
      stages: { orderBy: { order: 'asc' } },
      milestones: { orderBy: { order: 'asc' } },
      budgetRecord: true
    }
  })
}

export function findByCode(code: string) {
  return prisma.project.findUnique({ where: { code } })
}

/** Highest existing AST-nnn suffix, used to derive the next project code. */
export async function highestCodeNumber(prefix: string): Promise<number> {
  const rows = await prisma.project.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true }
  })
  let highest = 0
  for (const row of rows) {
    const suffix = Number.parseInt(row.code.slice(prefix.length), 10)
    if (Number.isFinite(suffix) && suffix > highest) highest = suffix
  }
  return highest
}

export function update(id: string, data: Prisma.ProjectUpdateInput) {
  return prisma.project.update({ where: { id }, data, include: LIST_INCLUDE })
}

export function softDelete(id: string) {
  return prisma.project.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'ARCHIVED' }
  })
}

/** Stage progress rows used to derive project completion (spec 56). */
export function stageProgress(projectId: string) {
  return prisma.projectStage.findMany({
    where: { projectId },
    select: { progress: true, weight: true, status: true }
  })
}

export function countOverdueTasks(projectId: string) {
  return prisma.task.count({
    where: {
      projectId,
      deletedAt: null,
      deadline: { lt: new Date() },
      status: { notIn: ['DONE', 'APPROVED'] }
    }
  })
}
