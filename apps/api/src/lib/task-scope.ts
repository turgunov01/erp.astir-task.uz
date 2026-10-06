import type { NextFunction, Request, Response } from 'express'
import type { Prisma } from '@prisma/client'
import { PERMISSION } from '@astir/types'
import { prisma } from './prisma'
import { hasPermission } from './rbac'
import { notFound, unauthenticated } from './errors'

type Caller = NonNullable<Request['user']>

/**
 * Which tasks a caller may see.
 *
 * `task:view` opens every task; anyone without it — an artist holding only
 * `task:view:own`, or a role that reaches tasks through the calendar — is
 * limited to the tasks assigned to them. The answer is enforced here rather
 * than trusted from a `mine=true` the client may simply leave out.
 *
 * Returns the assignee the caller is limited to, or null for no limit.
 */
export async function ownTaskAssignee(user: Caller): Promise<string | null> {
  return (await hasPermission(user.role, PERMISSION.TASK_VIEW)) ? null : user.id
}

/** The same scope as a filter to merge into a task query. */
export async function taskScope(user: Caller): Promise<Prisma.TaskWhereInput> {
  const assigneeId = await ownTaskAssignee(user)
  return assigneeId ? { assigneeId } : {}
}

/**
 * 404 for a task outside the caller's scope.
 *
 * Not 403: a task that is not yours should look like one that does not exist,
 * and the client replaces forbidden messages with a generic one anyway.
 */
export async function assertTaskVisible(user: Caller, taskId: string): Promise<void> {
  const assigneeId = await ownTaskAssignee(user)
  if (!assigneeId) return
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null, assigneeId },
    select: { id: true }
  })
  if (!task) throw notFound('Task')
}

/** Route guard for `/:id` task routes; runs after the id has been validated. */
export async function requireTaskAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw unauthenticated()
    await assertTaskVisible(req.user, req.params.id as string)
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Activity rows about tasks the caller cannot open are dropped: the log keeps
 * task titles in its metadata, so it would otherwise read them out.
 */
export async function activityTaskScope(user: Caller): Promise<Prisma.ActivityLogWhereInput> {
  const assigneeId = await ownTaskAssignee(user)
  if (!assigneeId) return {}
  const own = await prisma.task.findMany({ where: { assigneeId }, select: { id: true } })
  return {
    OR: [
      { entityType: { not: 'Task' } },
      { entityId: { in: own.map(task => task.id) } }
    ]
  }
}
