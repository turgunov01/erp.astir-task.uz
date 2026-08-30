import type { CreateShotInput } from '@astir/validation'
import { prisma } from '../../lib/prisma'
import { conflict, notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import { recordActivity } from '../../lib/activity'
import { cascadeFromShot } from '../production/rollup'
import * as repo from './shots.repository'
import { buildShotCode } from './shots.code'

export async function list(query: Parameters<typeof repo.findMany>[0] & {
  page: number
  limit: number
}) {
  const { skip, take } = toSkipTake(query.page, query.limit)
  const [items, total] = await Promise.all([
    repo.findMany({ ...query, skip, take }),
    repo.count(query)
  ])
  return { items, meta: buildMeta(total, query.page, query.limit) }
}

export async function getById(id: string) {
  const shot = await repo.findById(id)
  if (!shot) throw notFound('Shot')
  return shot
}

function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null
}

/**
 * Create a shot and materialise its per-stage rows from the project pipeline,
 * so a new shot immediately shows the full stage checklist (spec 15).
 */
export async function create(input: CreateShotInput, actorId?: string) {
  const [scene, episode, stages] = await Promise.all([
    input.sceneId
      ? prisma.scene.findUnique({
        where: { id: input.sceneId },
        select: { id: true, sceneNumber: true, episodeId: true, projectId: true }
      })
      : null,
    input.episodeId
      ? prisma.episode.findUnique({
        where: { id: input.episodeId },
        select: { id: true, number: true }
      })
      : null,
    prisma.projectStage.findMany({
      where: { projectId: input.projectId },
      select: { id: true }
    })
  ])

  if (input.sceneId && !scene) throw notFound('Scene')
  if (input.episodeId && !episode) throw notFound('Episode')

  // A shot inherits the episode of its scene when one was not given explicitly.
  const episodeId = input.episodeId ?? scene?.episodeId ?? null
  let episodeNumber = episode?.number ?? null
  if (episodeNumber == null && episodeId) {
    const owner = await prisma.episode.findUnique({
      where: { id: episodeId },
      select: { number: true }
    })
    episodeNumber = owner?.number ?? null
  }

  // Blank number means "next free in this scene" — the picker in the UI
  // leaves it empty for bulk entry.
  const shotNumber =
    input.shotNumber ??
    (await repo.highestShotNumber(input.sceneId ?? null, input.projectId)) + 1

  const code = buildShotCode({
    episodeNumber,
    sceneNumber: scene?.sceneNumber ?? null,
    shotNumber
  })

  const duplicate = await prisma.shot.findFirst({
    where: { projectId: input.projectId, code },
    select: { id: true }
  })
  if (duplicate) throw conflict('Shot ' + code + ' already exists in this project')

  const shot = await prisma.$transaction(async tx => {
    const created = await tx.shot.create({
      data: {
        projectId: input.projectId,
        episodeId,
        sceneId: input.sceneId ?? null,
        shotNumber,
        code,
        name: input.name ?? null,
        description: input.description ?? null,
        duration: input.duration ?? null,
        fps: input.fps,
        startFrame: input.startFrame ?? null,
        endFrame: input.endFrame ?? null,
        status: input.status,
        assigneeId: input.assigneeId ?? null,
        deadline: toDate(input.deadline)
      }
    })

    if (stages.length > 0) {
      await tx.shotStage.createMany({
        data: stages.map(stage => ({ shotId: created.id, stageId: stage.id }))
      })
    }

    await recordActivity(
      {
        actorId,
        entityType: 'Shot',
        entityId: created.id,
        projectId: input.projectId,
        action: 'shot.created',
        metadata: { code, stages: stages.length }
      },
      tx
    )

    return created
  })

  return getById(shot.id)
}

export async function update(id: string, input: Record<string, unknown>, actorId?: string) {
  const existing = await getById(id)

  const data: Record<string, unknown> = { ...input }
  if ('deadline' in input) data.deadline = toDate(input.deadline as string | null)

  await prisma.shot.update({ where: { id }, data })

  if (input.status && input.status !== existing.status) {
    await recordActivity({
      actorId,
      entityType: 'Shot',
      entityId: id,
      projectId: existing.projectId,
      action: 'shot.status_changed',
      metadata: { code: existing.code, from: existing.status, to: input.status }
    })
  }

  return getById(id)
}

/** Update one stage of one shot, then roll the change all the way up. */
export async function updateStage(
  shotId: string,
  stageId: string,
  input: Record<string, unknown>,
  actorId?: string
) {
  const shot = await getById(shotId)
  const shotStage = await repo.findShotStage(shotId, stageId)
  if (!shotStage) throw notFound('Shot stage')

  const data: Record<string, unknown> = { ...input }
  if ('deadline' in input) data.deadline = toDate(input.deadline as string | null)

  if (input.status === 'IN_PROGRESS' && !shotStage.startedAt) data.startedAt = new Date()
  if (input.status === 'DONE') {
    data.completedAt = new Date()
    data.progress = 100
  }

  await prisma.$transaction(async tx => {
    await tx.shotStage.update({
      where: { shotId_stageId: { shotId, stageId } },
      data
    })
    await cascadeFromShot(shotId, tx)
  })

  if (input.status && input.status !== shotStage.status) {
    await recordActivity({
      actorId,
      entityType: 'ShotStage',
      entityId: shotStage.id,
      projectId: shot.projectId,
      action: 'shot_stage.status_changed',
      metadata: { shot: shot.code, from: shotStage.status, to: input.status }
    })
  }

  return getById(shotId)
}

export async function remove(id: string) {
  const shot = await getById(id)
  await repo.softDelete(id)
  await cascadeFromShot(id).catch(() => undefined)
  return shot
}
