import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { conflict, notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import { recordActivity } from '../../lib/activity'
import { recalcEpisode, recalcProject, recalcScene } from '../production/rollup'

const INCLUDE = {
  project: { select: { id: true, code: true, name: true } },
  episode: { select: { id: true, number: true, title: true } },
  _count: { select: { shots: true, tasks: true } }
} satisfies Prisma.SceneInclude

export interface SceneListQuery {
  page: number
  limit: number
  search?: string
  projectId?: string
  episodeId?: string
  status?: string
  order: 'asc' | 'desc'
}

function buildWhere(query: Partial<SceneListQuery>): Prisma.SceneWhereInput {
  const where: Prisma.SceneWhereInput = { deletedAt: null }
  if (query.projectId) where.projectId = query.projectId
  if (query.episodeId) where.episodeId = query.episodeId
  if (query.status) where.status = query.status as Prisma.SceneWhereInput['status']
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' }
  return where
}

export async function list(query: SceneListQuery) {
  const { skip, take } = toSkipTake(query.page, query.limit)
  const where = buildWhere(query)
  const [items, total] = await Promise.all([
    prisma.scene.findMany({
      where,
      skip,
      take,
      orderBy: [{ episode: { number: 'asc' } }, { sceneNumber: 'asc' }],
      include: INCLUDE
    }),
    prisma.scene.count({ where })
  ])
  return { items, meta: buildMeta(total, query.page, query.limit) }
}

export async function getById(id: string) {
  const scene = await prisma.scene.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...INCLUDE,
      shots: {
        where: { deletedAt: null },
        orderBy: { shotNumber: 'asc' },
        select: { id: true, code: true, status: true, progress: true, shotNumber: true }
      }
    }
  })
  if (!scene) throw notFound('Scene')
  return scene
}

/**
 * Next free scene number.
 *
 * Scoped to the episode when there is one, otherwise to the project, matching
 * how the uniqueness constraint is defined.
 */
async function nextNumber(projectId: string, episodeId: string | null): Promise<number> {
  /*
   * findFirst rather than aggregate on purpose.
   *
   * The archive filter hides archived and deleted rows from aggregates, but the
   * unique constraint in the database counts them, so numbering off a filtered
   * maximum hands out a number that already exists.
   */
  const highest = await prisma.scene.findFirst({
    where: episodeId ? { episodeId } : { projectId, episodeId: null },
    orderBy: { sceneNumber: 'desc' },
    select: { sceneNumber: true }
  })
  return (highest?.sceneNumber ?? 0) + 1
}

export async function create(input: Record<string, unknown>, actorId?: string) {
  const projectId = input.projectId as string
  const episodeId = (input.episodeId as string | null) ?? null

  const [project, episode] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } }),
    episodeId
      ? prisma.episode.findFirst({
        where: { id: episodeId, deletedAt: null },
        select: { id: true, projectId: true }
      })
      : null
  ])

  if (!project) throw notFound('Project')
  if (episodeId && !episode) throw notFound('Episode')
  if (episode && episode.projectId !== projectId) {
    throw conflict('That episode belongs to a different project')
  }

  const sceneNumber =
    (input.sceneNumber as number | undefined) ?? (await nextNumber(projectId, episodeId))

  const duplicate = await prisma.scene.findFirst({
    where: episodeId ? { episodeId, sceneNumber } : { projectId, episodeId: null, sceneNumber },
    select: { id: true }
  })
  if (duplicate) throw conflict('Scene ' + sceneNumber + ' already exists here')

  const scene = await prisma.scene.create({
    data: {
      projectId,
      episodeId,
      sceneNumber,
      name: input.name as string,
      description: (input.description as string | null) ?? null,
      duration: (input.duration as number | null) ?? null,
      status: (input.status as never) ?? 'NOT_STARTED'
    },
    include: INCLUDE
  })

  await recordActivity({
    actorId,
    entityType: 'Scene',
    entityId: scene.id,
    projectId,
    action: 'scene.created',
    metadata: { sceneNumber, name: scene.name }
  })

  return scene
}

export async function update(id: string, input: Record<string, unknown>, actorId?: string) {
  const existing = await getById(id)
  const scene = await prisma.scene.update({ where: { id }, data: input, include: INCLUDE })

  if (input.status && input.status !== existing.status) {
    await recordActivity({
      actorId,
      entityType: 'Scene',
      entityId: id,
      projectId: existing.projectId,
      action: 'scene.status_changed',
      metadata: { from: existing.status, to: input.status }
    })
  }

  return scene
}

/** Refused while shots are still attached, for the same reason as episodes. */
export async function remove(id: string) {
  const scene = await getById(id)
  if (scene._count.shots > 0) {
    throw conflict('Scene still has ' + scene._count.shots + ' shot(s). Remove them first.')
  }

  await prisma.scene.update({ where: { id }, data: { deletedAt: new Date() } })

  if (scene.episodeId) await recalcEpisode(scene.episodeId).catch(() => undefined)
  await recalcProject(scene.projectId).catch(() => undefined)
}

export async function refresh(id: string) {
  const scene = await getById(id)
  await recalcScene(id)
  if (scene.episodeId) await recalcEpisode(scene.episodeId)
  await recalcProject(scene.projectId)
  return getById(id)
}
