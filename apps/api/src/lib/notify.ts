import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { logger } from './logger'

type Tx = Prisma.TransactionClient | typeof prisma

export interface NotificationInput {
  userId: string
  type: string
  title: string
  body?: string | null
  linkUrl?: string | null
  entityType?: string
  entityId?: string
}

/**
 * A failed statement aborts the whole Postgres transaction, so swallowing the
 * error is not enough on its own: inside a caller's transaction the insert is
 * wrapped in a savepoint and rolled back to it, leaving the caller's write
 * intact.
 */
const SAVEPOINT = 'notify_savepoint'

/** Opt-out model: a person hears about everything until they switch a type off. */
async function isMuted(input: NotificationInput, tx: Tx): Promise<boolean> {
  const preference = await tx.notificationPreference.findUnique({
    where: {
      userId_type_channel: {
        userId: input.userId,
        type: input.type as never,
        channel: 'IN_APP'
      }
    },
    select: { enabled: true }
  })
  return preference?.enabled === false
}

/**
 * Create an in-app notification (spec 47, 48).
 *
 * Delivery is IN_APP only for now; the channel column and preference table are
 * already in place so email and Telegram adapters can be added without
 * touching the call sites. An IN_APP preference switched off for the type
 * suppresses the notification.
 *
 * Never let a notification failure break the action that triggered it: being
 * unable to tell someone about an assignment must not roll back the
 * assignment itself.
 */
export async function notify(input: NotificationInput, tx: Tx = prisma): Promise<void> {
  const inTransaction = tx !== prisma

  try {
    if (inTransaction) await tx.$executeRawUnsafe('SAVEPOINT ' + SAVEPOINT)

    if (!(await isMuted(input, tx))) {
      await tx.notification.create({
        data: {
          userId: input.userId,
          type: input.type as never,
          title: input.title,
          body: input.body ?? null,
          linkUrl: input.linkUrl ?? null,
          entityType: input.entityType,
          entityId: input.entityId
        }
      })
    }

    if (inTransaction) await tx.$executeRawUnsafe('RELEASE SAVEPOINT ' + SAVEPOINT)
  } catch (err) {
    logger.error({ err, userId: input.userId, type: input.type }, 'notification failed')
    if (inTransaction) {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ' + SAVEPOINT).catch((rollbackErr: unknown) => {
        logger.error({ err: rollbackErr }, 'notification savepoint rollback failed')
      })
    }
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU')
}

/** "AST-001 · Name", from whichever parts are known. */
function projectLabel(code?: string | null, name?: string | null): string | null {
  const parts = [code, name].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Someone was put on a task (spec 47: TASK_ASSIGNED). */
export function notifyTaskAssigned(
  params: {
    assigneeId: string
    actorId?: string
    taskId: string
    taskTitle: string
    projectCode?: string | null
    projectName?: string | null
    deadline?: Date | null
  },
  tx: Tx = prisma
): Promise<void> {
  // Assigning work to yourself does not need an announcement.
  if (params.actorId && params.actorId === params.assigneeId) return Promise.resolve()

  const parts: string[] = []
  const project = projectLabel(params.projectCode, params.projectName)
  if (project) parts.push(project)
  if (params.deadline) parts.push('срок ' + formatDate(params.deadline))

  return notify(
    {
      userId: params.assigneeId,
      type: 'TASK_ASSIGNED',
      title: 'Вам назначена задача: ' + params.taskTitle,
      body: parts.length > 0 ? parts.join(' · ') : null,
      linkUrl: '/tasks?task=' + params.taskId,
      entityType: 'Task',
      entityId: params.taskId
    },
    tx
  )
}

/** Someone joined a project's team (PROJECT_ASSIGNED). */
export function notifyProjectAssigned(
  params: {
    userId: string
    actorId?: string
    projectId: string
    projectCode: string
    projectName: string
    /** What they are on the project as: a member role label, "Менеджер проекта". */
    roleLabel?: string | null
    deadline?: Date | null
  },
  tx: Tx = prisma
): Promise<void> {
  // Adding yourself to a project does not need an announcement either.
  if (params.actorId && params.actorId === params.userId) return Promise.resolve()

  const parts: string[] = [params.projectCode]
  if (params.roleLabel) parts.push(params.roleLabel)
  if (params.deadline) parts.push('срок ' + formatDate(params.deadline))

  return notify(
    {
      userId: params.userId,
      type: 'PROJECT_ASSIGNED',
      title: 'Вас добавили в проект: ' + params.projectName,
      body: parts.join(' · '),
      linkUrl: '/projects/' + params.projectId,
      entityType: 'Project',
      entityId: params.projectId
    },
    tx
  )
}
