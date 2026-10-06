import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { logger } from './logger'
import { afterCommit } from './after-commit'
import { deliverNotificationEmail, hasEmailChannel } from './notify-email'
import {
  formatDateFor,
  recipientLocale,
  renderText,
  translatorFor,
  type LocalizedText
} from '../i18n'

type Tx = Prisma.TransactionClient | typeof prisma

export interface NotificationInput {
  userId: string
  type: string
  /**
   * Worded for the recipient: pass `t => t('team.notifications.x', params)`
   * so the sentence comes out in their language, not the actor's. A plain
   * string is stored as it is (user-written text).
   */
  title: LocalizedText
  body?: LocalizedText | null
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
 * Create a notification (spec 47, 48).
 *
 * IN_APP is written here, inside the caller's transaction; an IN_APP
 * preference switched off for the type suppresses it. Types listed in
 * EMAIL_NOTIFICATION_TYPES also get a letter, queued to leave after the
 * transaction commits and gated by the EMAIL preference (notify-email.ts).
 * Telegram can be added the same way without touching the call sites.
 *
 * The text is worded once, here, in the recipient's language (their own
 * choice, else the studio default): the bell and the letter then say the same
 * thing, and a Turkish-speaking artist assigned by a Russian-speaking producer
 * reads Turkish.
 *
 * Never let a notification failure break the action that triggered it: being
 * unable to tell someone about an assignment must not roll back the
 * assignment itself.
 */
export async function notify(input: NotificationInput, tx: Tx = prisma): Promise<void> {
  const inTransaction = tx !== prisma

  try {
    if (inTransaction) await tx.$executeRawUnsafe('SAVEPOINT ' + SAVEPOINT)

    const recipient = await tx.user.findUnique({
      where: { id: input.userId },
      select: { locale: true }
    })
    const locale = await recipientLocale(recipient?.locale)
    const translate = translatorFor(locale)
    const title = renderText(input.title, translate)
    const body = input.body ? renderText(input.body, translate) : null

    if (!(await isMuted(input, tx))) {
      await tx.notification.create({
        data: {
          userId: input.userId,
          type: input.type as never,
          title,
          body,
          linkUrl: input.linkUrl ?? null,
          entityType: input.entityType,
          entityId: input.entityId
        }
      })
    }

    if (inTransaction) await tx.$executeRawUnsafe('RELEASE SAVEPOINT ' + SAVEPOINT)

    // Email is its own channel with its own switch, so an in-app mute does
    // not silence it. It leaves only once the caller's write has committed.
    if (hasEmailChannel(input.type)) {
      afterCommit(inTransaction ? tx : null, () => {
        void deliverNotificationEmail({
          userId: input.userId,
          type: input.type,
          title,
          body,
          linkUrl: input.linkUrl,
          entityType: input.entityType,
          locale
        })
      })
    }
  } catch (err) {
    logger.error({ err, userId: input.userId, type: input.type }, 'notification failed')
    if (inTransaction) {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ' + SAVEPOINT).catch((rollbackErr: unknown) => {
        logger.error({ err: rollbackErr }, 'notification savepoint rollback failed')
      })
    }
  }
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

  const project = projectLabel(params.projectCode, params.projectName)
  const deadline = params.deadline

  return notify(
    {
      userId: params.assigneeId,
      type: 'TASK_ASSIGNED',
      title: t => t('team.notifications.taskAssigned', { title: params.taskTitle }),
      body: (t) => {
        const parts: string[] = []
        if (project) parts.push(project)
        if (deadline) parts.push(t('team.notifications.deadline', { date: formatDateFor(t.locale, deadline) }))
        return parts.join(' · ')
      },
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
    /** What they are on the project as: a member's role, or the lead roles. */
    roleLabel?: LocalizedText | null
    deadline?: Date | null
  },
  tx: Tx = prisma
): Promise<void> {
  // Adding yourself to a project does not need an announcement either.
  if (params.actorId && params.actorId === params.userId) return Promise.resolve()

  const deadline = params.deadline

  return notify(
    {
      userId: params.userId,
      type: 'PROJECT_ASSIGNED',
      title: t => t('team.notifications.projectAssigned', { name: params.projectName }),
      body: (t) => {
        const parts: string[] = [params.projectCode]
        if (params.roleLabel) parts.push(renderText(params.roleLabel, t))
        if (deadline) parts.push(t('team.notifications.deadline', { date: formatDateFor(t.locale, deadline) }))
        return parts.join(' · ')
      },
      linkUrl: '/projects/' + params.projectId,
      entityType: 'Project',
      entityId: params.projectId
    },
    tx
  )
}
