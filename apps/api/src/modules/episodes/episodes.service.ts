import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { conflict, notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import { recordActivity } from '../../lib/activity'
import { recalcEpisode, recalcProject } from '../production/rollup'

const INCLUDE = {
  project: { select: { id: true, code: true, name: true } },
  _count: { select: { scenes: true, shots: true, tasks: true } }
} satisfies Prisma.EpisodeInclude

export interface EpisodeListQuery {
  page: number
  limit: number
  search?: string
  projectId?: string
  status?: string
  order: 'asc' | 'desc'
}

function buildWhere(query: Partial<EpisodeListQuery>): Prisma.EpisodeWhereInput {
  const where: Prisma.EpisodeWhereInput = { deletedAt: null }
  if (query.projectId) where.projectId = query.projectId
  if (query.status) where.status = query.status as Prisma.EpisodeWhereInput['status']
  if (query.search) where.title = { contains: query.search, mode: 'insensitive' }
  return where
}

export async function list(query: EpisodeListQuery) {
  const { skip, take } = toSkipTake(query.page, query.limit)
  const where = buildWhere(query)
  const [items, total] = await Promise.all([
    prisma.episode.findMany({ where, skip, take, orderBy: { number: 'asc' }, include: INCLUDE }),
    prisma.episode.count({ where })
  ])
  return { items, meta: buildMeta(total, query.page, query.limit) }
}

export async function getById(id: string) {
  const episode = await prisma.episode.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...INCLUDE,
      scenes: {
        where: { deletedAt: null },
        orderBy: { sceneNumber: 'asc' },
        include: { _count: { select: { shots: true } } }
      }
    }
  })
  if (!episode) throw notFound('Episode')
  return episode
}

function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null
}

/** Next free episode number in the project, so the form can leave it blank. */
async function nextNumber(projectId: string): Promise<number> {
  /*
   * findFirst rather than aggregate on purpose.
   *
   * The archive filter hides archived and deleted rows from aggregates, but the
   * unique constraint in the database counts them, so numbering off a filtered
   * maximum hands out a number that already exists.
   */
  const highest = await prisma.episode.findFirst({
    where: { projectId },
    orderBy: { number: 'desc' },
    select: { number: true }
  })
  return (highest?.number ?? 0) + 1
}

export async function create(input: Record<string, unknown>, actorId?: string) {
  const projectId = input.projectId as string
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true }
  })
  if (!project) throw notFound('Project')

  const number = (input.number as number | undefined) ?? (await nextNumber(projectId))

  const duplicate = await prisma.episode.findFirst({
    where: { projectId, number },
    select: { id: true }
  })
  if (duplicate) throw conflict('Episode ' + number + ' already exists in this project')

  const episode = await prisma.episode.create({
    data: {
      projectId,
      number,
      title: input.title as string,
      description: (input.description as string | null) ?? null,
      duration: (input.duration as number | null) ?? null,
      status: (input.status as never) ?? 'NOT_STARTED',
      startDate: toDate(input.startDate as string | null),
      deadline: toDate(input.deadline as string | null)
    },
    include: INCLUDE
  })

  await recordActivity({
    actorId,
    entityType: 'Episode',
    entityId: episode.id,
    projectId,
    action: 'episode.created',
    metadata: { number, title: episode.title }
  })

  return episode
}

export async function update(id: string, input: Record<string, unknown>, actorId?: string) {
  const existing = await getById(id)

  const data: Record<string, unknown> = { ...input }
  if ('startDate' in input) data.startDate = toDate(input.startDate as string | null)
  if ('deadline' in input) data.deadline = toDate(input.deadline as string | null)

  const episode = await prisma.episode.update({ where: { id }, data, include: INCLUDE })

  if (input.status && input.status !== existing.status) {
    await recordActivity({
      actorId,
      entityType: 'Episode',
      entityId: id,
      projectId: existing.projectId,
      action: 'episode.status_changed',
      metadata: { from: existing.status, to: input.status }
    })
  }

  return episode
}

/**
 * Soft delete.
 *
 * Refused while scenes are still attached: removing the episode would leave
 * them pointing at a parent the UI no longer lists.
 */
export async function remove(id: string) {
  const episode = await getById(id)
  if (episode._count.scenes > 0) {
    throw conflict('Episode still has ' + episode._count.scenes + ' scene(s). Remove them first.')
  }

  await prisma.episode.update({ where: { id }, data: { deletedAt: new Date() } })
  await recalcProject(episode.projectId).catch(() => undefined)
}

/** Recompute this episode from its scenes, then roll up to the project. */
export async function refresh(id: string) {
  const episode = await getById(id)
  await recalcEpisode(id)
  await recalcProject(episode.projectId)
  return getById(id)
}
