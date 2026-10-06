import { prisma } from './prisma'
import { notify } from './notify'
import { recordActivity } from './activity'
import { currentLocale, recipientLocale, renderText, tFor, translatorFor, type LocalizedText } from '../i18n'

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
  /** Worded for each administrator in their own language. */
  change: LocalizedText
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
   *
   * A comment is stored text the whole team reads, so its lead-in is worded
   * once in the studio's default language; the reason stays as typed.
   */
  if (input.actorId) {
    const studioLocale = await recipientLocale(null)
    await prisma.comment.create({
      data: {
        userId: input.actorId,
        entityType: 'Task',
        entityId: input.taskId,
        message: tFor(studioLocale, 'production.tasks.overdueComment', { days: late, reason: input.reason })
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
      // The feed keeps one wording: the editor's language at the time.
      change: renderText(input.change, translatorFor(currentLocale())),
      reason: input.reason
    }
  })

  await Promise.all(
    admins.map(admin =>
      notify({
        userId: admin.id,
        type: 'TASK_OVERDUE',
        title: t => t('team.notifications.overdueEdited', { title: input.taskTitle }),
        body: t =>
          (input.projectCode ? input.projectCode + ' · ' : '') +
          t('team.notifications.overdueEditedBody', { days: late, change: renderText(input.change, t) }) +
          (input.actorName ? ' · ' + input.actorName : '') +
          ' · ' + t('team.notifications.overdueReason', { reason: input.reason }),
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
