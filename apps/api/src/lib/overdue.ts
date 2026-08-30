import { prisma } from './prisma'
import { notify } from './notify'
import { recordActivity } from './activity'

/** Statuses that mean the work is finished, so a past deadline no longer matters. */
const CLOSED = new Set(['DONE', 'APPROVED'])

export interface OverdueCandidate {
  deadline: Date | null
  status: string
  archivedAt?: Date | null
}

/**
 * A task is overdue when its deadline has passed while it is still open.
 * Archived tasks are excluded: they were deliberately taken out of the flow.
 */
export function isOverdue(task: OverdueCandidate, now: Date = new Date()): boolean {
  if (!task.deadline) return false
  if (CLOSED.has(task.status)) return false
  if (task.archivedAt) return false
  return task.deadline.getTime() < now.getTime()
}

export function daysLate(deadline: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - deadline.getTime()) / 86400000))
}

/** Everyone who should be told when a late task is touched. */
async function administrators(excludeId?: string) {
  return prisma.user.findMany({
    where: {
      role: { in: ['OWNER', 'ADMIN'] },
      isActive: true,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true }
  })
}

export interface OverdueEditInput {
  taskId: string
  taskTitle: string
  projectId: string
  projectCode?: string | null
  deadline: Date
  actorId?: string
  actorName?: string
  /** What the editor said they are changing and why. */
  reason: string
  change: string
}

/**
 * Announce that a late task was edited (spec 47 style in-app notification).
 *
 * Editing an overdue task is allowed, but never silently: administration is
 * told what changed, by whom, and why, and the same record lands in the
 * activity feed so it survives the notification being dismissed.
 */
export async function announceOverdueEdit(input: OverdueEditInput): Promise<void> {
  const late = daysLate(input.deadline)
  const admins = await administrators(input.actorId)

  /*
   * The reason is also written into the task discussion.
   *
   * The activity log and the admin notification are for oversight; the person
   * working on the task looks at the thread, and an explanation they cannot
   * find is an explanation nobody reads.
   */
  if (input.actorId) {
    await prisma.comment.create({
      data: {
        userId: input.actorId,
        entityType: 'Task',
        entityId: input.taskId,
        message: 'Правка просроченной задачи (' + late + ' дн): ' + input.reason
      }
    })
  }

  await recordActivity({
    actorId: input.actorId,
    entityType: 'Task',
    entityId: input.taskId,
    projectId: input.projectId,
    action: 'task.overdue_edited',
    metadata: {
      title: input.taskTitle,
      daysLate: late,
      change: input.change,
      reason: input.reason
    }
  })

  await Promise.all(
    admins.map(admin =>
      notify({
        userId: admin.id,
        type: 'TASK_OVERDUE',
        title: 'Правка просроченной задачи: ' + input.taskTitle,
        body:
          (input.projectCode ? input.projectCode + ' · ' : '') +
          'просрочка ' + late + ' дн · ' + input.change +
          (input.actorName ? ' · ' + input.actorName : '') +
          ' · причина: ' + input.reason,
        linkUrl: '/tasks?task=' + input.taskId,
        entityType: 'Task',
        entityId: input.taskId
      })
    )
  )
}

/** Overdue tasks across the studio, for the administration overview. */
export async function overdueSummary() {
  const now = new Date()
  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      archivedAt: null,
      deadline: { lt: now },
      status: { notIn: ['DONE', 'APPROVED'] }
    },
    orderBy: { deadline: 'asc' },
    select: {
      id: true,
      title: true,
      deadline: true,
      status: true,
      priority: true,
      project: { select: { id: true, code: true } },
      assignee: { select: { id: true, firstName: true, lastName: true } }
    }
  })

  return tasks.map(task => ({
    ...task,
    daysLate: task.deadline ? daysLate(task.deadline, now) : 0
  }))
}
