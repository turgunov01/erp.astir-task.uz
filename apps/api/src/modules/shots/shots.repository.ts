import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

export interface ShotListParams {
  skip: number
  take: number
  search?: string
  projectId?: string
  episodeId?: string
  sceneId?: string
  status?: string
  assigneeId?: string
  sort: string
  order: 'asc' | 'desc'
}

const SORTABLE = new Set(['code', 'shotNumber', 'createdAt', 'deadline', 'progress', 'status'])

export function buildWhere(params: Partial<ShotListParams>): Prisma.ShotWhereInput {
  const where: Prisma.ShotWhereInput = { deletedAt: null }
  if (params.projectId) where.projectId = params.projectId
  if (params.episodeId) where.episodeId = params.episodeId
  if (params.sceneId) where.sceneId = params.sceneId
  if (params.assigneeId) where.assigneeId = params.assigneeId
  if (params.status) where.status = params.status as Prisma.ShotWhereInput['status']
  if (params.search) {
    where.OR = [
      { code: { contains: params.search, mode: 'insensitive' } },
      { name: { contains: params.search, mode: 'insensitive' } }
    ]
  }
  return where
}

const LIST_INCLUDE = {
  project: { select: { id: true, code: true, name: true } },
  episode: { select: { id: true, number: true, title: true } },
  scene: { select: { id: true, sceneNumber: true, name: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { tasks: true, versions: true } }
} satisfies Prisma.ShotInclude

export function findMany(params: ShotListParams) {
  const orderField = SORTABLE.has(params.sort) ? params.sort : 'code'
  return prisma.shot.findMany({
    where: buildWhere(params),
    skip: params.skip,
    take: params.take,
    orderBy: { [orderField]: params.order },
    include: LIST_INCLUDE
  })
}

export function count(params: Partial<ShotListParams>) {
  return prisma.shot.count({ where: buildWhere(params) })
}

export function findById(id: string) {
  return prisma.shot.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...LIST_INCLUDE,
      stages: {
        orderBy: { stage: { order: 'asc' } },
        include: {
          stage: { select: { id: true, name: true, order: true, weight: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } }
        }
      }
    }
  })
}

export function findShotStage(shotId: string, stageId: string) {
  return prisma.shotStage.findUnique({
    where: { shotId_stageId: { shotId, stageId } }
  })
}

export function softDelete(id: string) {
  return prisma.shot.update({ where: { id }, data: { deletedAt: new Date() } })
}

/**
 * Highest shot number in a scene, so the next one can be derived.
 *
 * Counts archived and deleted shots too: the unique constraint in the database
 * counts them, so numbering off a filtered maximum hands out a number that
 * already exists. findFirst is used because aggregates carry the archive filter.
 */
export async function highestShotNumber(sceneId: string | null, projectId: string) {
  const highest = await prisma.shot.findFirst({
    where: sceneId ? { sceneId } : { projectId, sceneId: null },
    orderBy: { shotNumber: 'desc' },
    select: { shotNumber: true }
  })
  return highest?.shotNumber ?? 0
}
