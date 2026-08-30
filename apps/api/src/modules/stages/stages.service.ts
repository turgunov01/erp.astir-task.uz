import { prisma } from '../../lib/prisma'
import { notFound, conflict } from '../../lib/errors'
import { recordActivity } from '../../lib/activity'
import { recalcProject } from '../production/rollup'

const INCLUDE = {
  assignee: { select: { id: true, firstName: true, lastName: true } },
  department: { select: { id: true, name: true } },
  _count: { select: { tasks: true, shotStages: true } }
}

export function listByProject(projectId: string) {
  return prisma.projectStage.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    include: INCLUDE
  })
}

export async function getById(id: string) {
  const stage = await prisma.projectStage.findUnique({ where: { id }, include: INCLUDE })
  if (!stage) throw notFound('Stage')
  return stage
}

function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null
}

/**
 * Update a pipeline stage and refresh the project immediately.
 *
 * Both writes share a transaction so the project percentage on the dashboard
 * can never disagree with the stage rows it was derived from.
 */
export async function update(id: string, input: Record<string, unknown>, actorId?: string) {
  const stage = await getById(id)

  const data: Record<string, unknown> = { ...input }
  if ('deadline' in input) data.deadline = toDate(input.deadline as string | null)

  // DONE implies 100%: a stage marked complete but sitting at 60% would make
  // the rolled-up project number quietly wrong.
  if (input.status === 'DONE') data.progress = 100
  if (input.status === 'NOT_STARTED') data.progress = 0
  if (input.status === 'IN_PROGRESS' && !stage.startDate) data.startDate = new Date()

  await prisma.$transaction(async tx => {
    await tx.projectStage.update({ where: { id }, data })
    await recalcProject(stage.projectId, tx)
  })

  if (input.status && input.status !== stage.status) {
    await recordActivity({
      actorId,
      entityType: 'ProjectStage',
      entityId: id,
      projectId: stage.projectId,
      action: 'stage.status_changed',
      metadata: { stage: stage.name, from: stage.status, to: input.status }
    })
  }

  return getById(id)
}

/** Append a custom stage at the end of the pipeline. */
export async function create(
  input: { projectId: string, name: string, weight?: number, departmentId?: string | null },
  actorId?: string
) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, deletedAt: null },
    select: { id: true }
  })
  if (!project) throw notFound('Project')

  const last = await prisma.projectStage.aggregate({
    where: { projectId: input.projectId },
    _max: { order: true }
  })

  const stage = await prisma.projectStage.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      order: (last._max.order ?? 0) + 1,
      weight: input.weight ?? 1,
      departmentId: input.departmentId ?? null
    },
    include: INCLUDE
  })

  await recordActivity({
    actorId,
    entityType: 'ProjectStage',
    entityId: stage.id,
    projectId: input.projectId,
    action: 'stage.created',
    metadata: { name: stage.name }
  })

  return stage
}

/**
 * Remove a stage.
 *
 * Refused while tasks or per-shot rows still point at it, since deleting would
 * detach real production work from the pipeline it belongs to.
 */
export async function remove(id: string) {
  const stage = await getById(id)
  if (stage._count.tasks > 0) {
    throw conflict('Stage still has ' + stage._count.tasks + ' task(s) attached.')
  }

  await prisma.$transaction(async tx => {
    await tx.shotStage.deleteMany({ where: { stageId: id } })
    await tx.projectStage.delete({ where: { id } })
    await recalcProject(stage.projectId, tx)
  })
}
