import type { CreateTaskInput } from '@astir/validation'
import { prisma } from '../../lib/prisma'
import { conflict, notFound, badRequest } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import { recordActivity } from '../../lib/activity'
import { notifyTaskAssigned } from '../../lib/notify'
import { announceOverdueEdit, isOverdue } from '../../lib/overdue'
import * as comments from '../comments/comments.service'
import { recalcProject } from '../production/rollup'
import { taskStatusChange } from '../../lib/labels'
import { t, type LocalizedText, type MessageKey } from '../../i18n'
import * as repo from './tasks.repository'

/** Statuses that count as "this task is finished" for dependency purposes. */
const TERMINAL_STATUSES = new Set(['DONE', 'APPROVED'])

/** Statuses that mean work has actually begun. */
const STARTED_STATUSES = new Set(['IN_PROGRESS', 'REVIEW', 'REVISION', 'APPROVED', 'DONE'])

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
  const task = await repo.findById(id)
  if (!task) throw notFound('Task')
  return task
}

function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null
}

export async function create(input: CreateTaskInput, actorId?: string) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, deletedAt: null },
    select: { id: true, code: true, name: true }
  })
  if (!project) throw notFound('Project')

  const task = await prisma.$transaction(async tx => {
    const created = await tx.task.create({
      data: {
        projectId: input.projectId,
        episodeId: input.episodeId ?? null,
        sceneId: input.sceneId ?? null,
        shotId: input.shotId ?? null,
        stageId: input.stageId ?? null,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        reviewerId: input.reviewerId ?? null,
        estimatedHours: input.estimatedHours ?? null,
        startDate: toDate(input.startDate),
        deadline: toDate(input.deadline),
        createdById: actorId ?? null
      }
    })

    if (input.dependsOnTaskIds && input.dependsOnTaskIds.length > 0) {
      await tx.taskDependency.createMany({
        data: input.dependsOnTaskIds.map(dependsOnTaskId => ({
          taskId: created.id,
          dependsOnTaskId
        })),
        skipDuplicates: true
      })
    }

    await recordActivity(
      {
        actorId,
        entityType: 'Task',
        entityId: created.id,
        projectId: input.projectId,
        action: 'task.created',
        metadata: { title: created.title }
      },
      tx
    )

    if (input.assigneeId) {
      await notifyTaskAssigned(
        {
          assigneeId: input.assigneeId,
          actorId,
          taskId: created.id,
          taskTitle: created.title,
          projectCode: project.code,
          projectName: project.name,
          deadline: created.deadline
        },
        tx
      )
    }

    return created
  })

  return getById(task.id)
}

/**
 * Editing a task that is already late always reaches administration.
 * The reason is mandatory rather than optional, because a notification
 * saying only "someone changed something" is not worth sending.
 */
function describeChange(input: Record<string, unknown>): LocalizedText {
  const fields = Object.keys(input).filter(key => key !== 'overdueReason')
  // Worded per administrator: field names in their language, unknown ones as they are.
  return translate => {
    if (fields.length === 0) return translate('production.tasks.noChanges')
    return fields.map(field => {
      const key = ('production.tasks.fields.' + field) as MessageKey
      const label = translate(key)
      return label === key ? field : label
    }).join(', ')
  }
}

export async function update(id: string, input: Record<string, unknown>, actorId?: string) {
  const existing = await getById(id)

  const late = isOverdue(existing)
  const reason = typeof input.overdueReason === 'string' ? input.overdueReason : ''
  if (late && reason.length < 3) {
    throw badRequest(
      t('production.tasks.overdueEditReason'),
      { overdueReason: [t('production.tasks.overdueEditReasonField')] }
    )
  }
  delete input.overdueReason

  const data: Record<string, unknown> = { ...input }
  if ('deadline' in input) data.deadline = toDate(input.deadline as string | null)
  if ('startDate' in input) data.startDate = toDate(input.startDate as string | null)

  const updated = await prisma.task.update({
    where: { id },
    data,
    select: { title: true, deadline: true }
  })

  // Reassignment only: the previous assignee is not told they were taken off.
  if (input.assigneeId && input.assigneeId !== existing.assigneeId) {
    // The same edit may rename or reschedule, so announce what was saved.
    await notifyTaskAssigned({
      assigneeId: input.assigneeId as string,
      actorId,
      taskId: id,
      taskTitle: updated.title,
      projectCode: existing.project?.code ?? null,
      projectName: existing.project?.name ?? null,
      deadline: updated.deadline
    })

    await recordActivity({
      actorId,
      entityType: 'Task',
      entityId: id,
      projectId: existing.projectId,
      action: 'task.assigned',
      metadata: { title: updated.title }
    })
  }

  if (late) {
    await announceOverdueEdit({
      taskId: id,
      taskTitle: existing.title,
      projectId: existing.projectId,
      projectCode: existing.project?.code ?? null,
      deadline: existing.deadline as Date,
      actorId,
      reason,
      change: describeChange(input)
    })
  }

  return getById(id)
}

/**
 * Move a task to a new status.
 *
 * A task may not start while a prerequisite is unfinished (spec 18). The block
 * is reported with the offending task names so the UI can explain the refusal
 * instead of showing a generic error; a manager can pass an explicit override.
 */
export async function changeStatus(
  id: string,
  status: string,
  overrideDependencies: boolean,
  actorId?: string,
  overdueReason?: string,
  evidence?: { comment?: string, documentId?: string }
) {
  const task = await getById(id)

  // Closing a late task is the one move that needs no explanation:
  // finishing it is exactly what should happen.
  const closing = status === 'DONE' || status === 'APPROVED'
  const late = isOverdue(task)
  if (late && !closing && (overdueReason ?? '').trim().length < 3) {
    throw badRequest(
      t('production.tasks.overdueMoveReason'),
      { overdueReason: [t('production.tasks.overdueMoveReasonField')] }
    )
  }

  if (STARTED_STATUSES.has(status) && !overrideDependencies) {
    const blocking = task.dependencies
      .map(dependency => dependency.dependsOnTask)
      .filter(prerequisite => prerequisite && !TERMINAL_STATUSES.has(prerequisite.status))

    if (blocking.length > 0) {
      throw conflict(t('production.tasks.prerequisitesUnfinished', {
        tasks: blocking.map(item => item.title).join(', ')
      }))
    }
  }

  const data: Record<string, unknown> = { status }
  if (STARTED_STATUSES.has(status) && !task.startDate) data.startDate = new Date()

  await prisma.$transaction(async tx => {
    await tx.task.update({ where: { id }, data })
    // Overdue task counts feed project risk, so refresh it on every move.
    await recalcProject(task.projectId, tx)
  })

  if (late && !closing) {
    await announceOverdueEdit({
      taskId: id,
      taskTitle: task.title,
      projectId: task.projectId,
      projectCode: task.project?.code ?? null,
      deadline: task.deadline as Date,
      actorId,
      reason: (overdueReason ?? '').trim(),
      change: t => t('production.tasks.statusChange', { change: taskStatusChange(t, task.status, status) })
    })
  }

  const note = (evidence?.comment ?? '').trim()
  if (note.length > 0 && actorId) {
    await comments.create(
      {
        entityType: 'Task',
        entityId: id,
        message: taskStatusChange(t, task.status, status) + ': ' + note
      },
      actorId
    ).catch(() => undefined)
  }

  if (evidence?.documentId) {
    await prisma.document.update({
      where: { id: evidence.documentId },
      // Attaching the proof to the project keeps it findable from Files.
      data: { projectId: task.projectId }
    }).catch(() => undefined)
  }

  await recordActivity({
    actorId,
    entityType: 'Task',
    entityId: id,
    projectId: task.projectId,
    action: 'task.status_changed',
    metadata: {
      title: task.title,
      from: task.status,
      to: status,
      overridden: overrideDependencies || undefined,
      evidence: evidence?.documentId ? 'file' : 'comment'
    }
  })

  return getById(id)
}

export async function addDependency(id: string, dependsOnTaskId: string) {
  const task = await getById(id)
  if (dependsOnTaskId === id) throw badRequest(t('production.tasks.selfDependency'))

  const prerequisite = await repo.findById(dependsOnTaskId)
  if (!prerequisite) throw notFound('Prerequisite task')
  if (prerequisite.projectId !== task.projectId) {
    throw badRequest(t('production.tasks.crossProjectDependency'))
  }

  // One level of cycle detection: the prerequisite must not already depend on us.
  const reverse = prerequisite.dependencies.some(
    dependency => dependency.dependsOnTaskId === id
  )
  if (reverse) throw conflict(t('production.tasks.reverseDependency'))

  await prisma.taskDependency.create({
    data: { taskId: id, dependsOnTaskId }
  })

  return getById(id)
}

export async function removeDependency(id: string, dependsOnTaskId: string) {
  await prisma.taskDependency.deleteMany({ where: { taskId: id, dependsOnTaskId } })
  return getById(id)
}

/**
 * Soft delete: the row is kept with deletedAt set, so a mistaken deletion
 * can still be recovered from the database.
 *
 * Logged to the activity feed — an unlogged deletion leaves no trace of who
 * removed what, which is exactly the question asked afterwards.
 */
export async function remove(id: string, actorId?: string) {
  const task = await getById(id)
  await repo.softDelete(id)
  await recalcProject(task.projectId).catch(() => undefined)

  await recordActivity({
    actorId,
    entityType: 'Task',
    entityId: id,
    projectId: task.projectId,
    action: 'task.deleted',
    metadata: { title: task.title }
  })
}

export function boardCounts(projectId: string, assigneeId?: string | null) {
  return repo.countByStatus(projectId, assigneeId)
}

/**
 * Archive a task.
 *
 * Everything is kept — history, versions, dependencies — the task simply
 * leaves the active lists. Reversible, unlike remove().
 */
export async function archive(id: string, actorId?: string) {
  const task = await getById(id)
  if (task.archivedAt) throw conflict(t('production.tasks.alreadyArchived'))

  await prisma.$transaction(async tx => {
    await tx.task.update({ where: { id }, data: { archivedAt: new Date() } })
    // An archived task no longer counts toward overdue risk.
    await recalcProject(task.projectId, tx)
  })

  await recordActivity({
    actorId,
    entityType: 'Task',
    entityId: id,
    projectId: task.projectId,
    action: 'task.archived',
    metadata: { title: task.title }
  })

  return getById(id)
}

export async function unarchive(id: string, actorId?: string) {
  const task = await getById(id)
  if (!task.archivedAt) throw conflict(t('production.tasks.notArchived'))

  await prisma.$transaction(async tx => {
    await tx.task.update({ where: { id }, data: { archivedAt: null } })
    await recalcProject(task.projectId, tx)
  })

  await recordActivity({
    actorId,
    entityType: 'Task',
    entityId: id,
    projectId: task.projectId,
    action: 'task.unarchived',
    metadata: { title: task.title }
  })

  return getById(id)
}
