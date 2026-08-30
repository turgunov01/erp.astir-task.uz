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
 * Create an in-app notification (spec 47, 48).
 *
 * Delivery is IN_APP only for now; the channel column and preference table are
 * already in place so email and Telegram adapters can be added without
 * touching the call sites.
 *
 * Never let a notification failure break the action that triggered it: being
 * unable to tell someone about an assignment must not roll back the
 * assignment itself.
 */
export async function notify(input: NotificationInput, tx: Tx = prisma): Promise<void> {
  try {
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
  } catch (err) {
    logger.error({ err, userId: input.userId, type: input.type }, 'notification failed')
  }
}

/** Someone was put on a task (spec 47: TASK_ASSIGNED). */
export function notifyTaskAssigned(
  params: {
    assigneeId: string
    actorId?: string
    taskId: string
    taskTitle: string
    projectCode?: string | null
    deadline?: Date | null
  },
  tx: Tx = prisma
): Promise<void> {
  // Assigning work to yourself does not need an announcement.
  if (params.actorId && params.actorId === params.assigneeId) return Promise.resolve()

  const parts: string[] = []
  if (params.projectCode) parts.push(params.projectCode)
  if (params.deadline) {
    parts.push('дедлайн ' + params.deadline.toLocaleDateString('ru-RU'))
  }

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
