import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { calculateProgress, calculateRisk } from '../projects/projects.progress'

type Tx = Prisma.TransactionClient | typeof prisma

/**
 * Progress cascade (spec 56).
 *
 *   ShotStage -> Shot -> Scene -> Episode -> Project
 *
 * Every level is derived from the level below, so a number shown anywhere in
 * the UI can be traced back to actual stage completion. Nothing here accepts a
 * user-supplied percentage.
 *
 * Each step recomputes only the ancestors of what changed rather than the whole
 * project, so updating one stage stays a handful of indexed queries.
 */

/** Weighted by the pipeline stage weight, matching project-level maths. */
export async function recalcShot(shotId: string, tx: Tx = prisma): Promise<void> {
  const stages = await tx.shotStage.findMany({
    where: { shotId },
    select: { progress: true, status: true, stage: { select: { weight: true } } }
  })

  if (stages.length === 0) return

  const progress = calculateProgress(
    stages.map(row => ({
      progress: row.progress,
      status: row.status,
      weight: row.stage?.weight ?? 1
    }))
  )

  const allDone = stages.every(row => row.status === 'DONE')

  await tx.shot.update({
    where: { id: shotId },
    data: {
      progress,
      // Only advance to COMPLETED automatically; never walk a shot backwards
      // out of a state a human set deliberately.
      ...(allDone ? { status: 'COMPLETED' as const } : {})
    }
  })
}

export async function recalcScene(sceneId: string, tx: Tx = prisma): Promise<void> {
  const shots = await tx.shot.findMany({
    where: { sceneId, deletedAt: null },
    select: { progress: true }
  })
  if (shots.length === 0) return

  const total = shots.reduce((sum, shot) => sum + shot.progress, 0)
  await tx.scene.update({
    where: { id: sceneId },
    data: { progress: Math.round(total / shots.length) }
  })
}

export async function recalcEpisode(episodeId: string, tx: Tx = prisma): Promise<void> {
  const scenes = await tx.scene.findMany({
    where: { episodeId, deletedAt: null },
    select: { progress: true }
  })
  if (scenes.length === 0) return

  const total = scenes.reduce((sum, scene) => sum + scene.progress, 0)
  await tx.episode.update({
    where: { id: episodeId },
    data: { progress: Math.round(total / scenes.length) }
  })
}

export async function recalcProject(projectId: string, tx: Tx = prisma): Promise<void> {
  const [stages, project, overdueTasks] = await Promise.all([
    tx.projectStage.findMany({
      where: { projectId },
      select: { progress: true, weight: true, status: true }
    }),
    tx.project.findUnique({
      where: { id: projectId },
      select: { startDate: true, deadline: true }
    }),
    tx.task.count({
      where: {
        projectId,
        deletedAt: null,
        deadline: { lt: new Date() },
        status: { notIn: ['DONE', 'APPROVED'] }
      }
    })
  ])

  if (!project || stages.length === 0) return

  const progress = calculateProgress(stages)
  const risk = calculateRisk({
    progress,
    startDate: project.startDate,
    deadline: project.deadline,
    overdueTasks
  })

  await tx.project.update({ where: { id: projectId }, data: { progress, risk } })
}

/**
 * Walk the whole chain upward from one shot.
 *
 * Ancestors are read from the shot itself rather than passed in, so callers
 * cannot accidentally roll up into the wrong scene after a shot is moved.
 */
export async function cascadeFromShot(shotId: string, tx: Tx = prisma): Promise<void> {
  const shot = await tx.shot.findUnique({
    where: { id: shotId },
    select: { sceneId: true, episodeId: true, projectId: true }
  })
  if (!shot) return

  await recalcShot(shotId, tx)
  if (shot.sceneId) await recalcScene(shot.sceneId, tx)
  if (shot.episodeId) await recalcEpisode(shot.episodeId, tx)
  await recalcProject(shot.projectId, tx)
}
