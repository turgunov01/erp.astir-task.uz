import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { forbidden, notFound, badRequest } from '../../lib/errors'
import { notify } from '../../lib/notify'

const AUTHOR = {
  select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true }
}

const INCLUDE = {
  user: AUTHOR,
  replies: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
    include: { user: AUTHOR }
  }
} satisfies Prisma.CommentInclude

/**
 * Extract @mentions and resolve them to real users.
 *
 * Matching is on "@Firstname Lastname" as rendered in the picker, so a stray
 * word starting with @ never turns into a notification to a stranger.
 */
export async function resolveMentions(message: string): Promise<string[]> {
  if (!message.includes('@')) return []

  const users = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, firstName: true, lastName: true }
  })

  const lower = message.toLowerCase()
  return users
    .filter(user => lower.includes('@' + (user.firstName + ' ' + user.lastName).toLowerCase()))
    .map(user => user.id)
}

export async function list(entityType: string, entityId: string) {
  return prisma.comment.findMany({
    where: { entityType, entityId, parentId: null, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: INCLUDE
  })
}

export async function create(
  input: { entityType: string, entityId: string, message: string, parentId?: string | null },
  actorId: string
) {
  if (input.parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: input.parentId, deletedAt: null },
      select: { id: true, parentId: true }
    })
    if (!parent) throw notFound('Parent comment')
    // One level of nesting: replies to replies flatten into the same thread.
    if (parent.parentId) input.parentId = parent.parentId
  }

  const mentionedUserIds = await resolveMentions(input.message)

  const comment = await prisma.comment.create({
    data: {
      userId: actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      message: input.message,
      parentId: input.parentId ?? null,
      mentionedUserIds
    },
    include: INCLUDE
  })

  for (const userId of mentionedUserIds) {
    if (userId === actorId) continue
    await notify({
      userId,
      type: 'COMMENT_MENTION',
      title: 'Вас упомянули в обсуждении',
      body: input.message.slice(0, 140),
      linkUrl: linkFor(input.entityType, input.entityId),
      entityType: input.entityType,
      entityId: input.entityId
    })
  }

  return comment
}

function linkFor(entityType: string, entityId: string): string {
  if (entityType === 'Task') return '/tasks?task=' + entityId
  if (entityType === 'Shot') return '/shots/' + entityId
  if (entityType === 'Review') return '/reviews?review=' + entityId
  if (entityType === 'Project') return '/projects/' + entityId
  return '/activity'
}

/** Only the author edits their own words. */
export async function update(id: string, message: string, actorId: string) {
  const comment = await prisma.comment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, userId: true }
  })
  if (!comment) throw notFound('Comment')
  if (comment.userId !== actorId) throw forbidden('Редактировать можно только свой комментарий')
  if (message.trim().length === 0) throw badRequest('Комментарий не может быть пустым')

  return prisma.comment.update({
    where: { id },
    data: { message, mentionedUserIds: await resolveMentions(message) },
    include: INCLUDE
  })
}

/**
 * Soft delete so replies keep their anchor: a thread with a hole in the middle
 * reads worse than one showing that a message was removed.
 */
export async function remove(id: string, actorId: string, role?: string) {
  const comment = await prisma.comment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, userId: true }
  })
  if (!comment) throw notFound('Comment')

  const privileged = ['OWNER', 'ADMIN', 'PROJECT_MANAGER'].includes(role ?? '')
  if (comment.userId !== actorId && !privileged) {
    throw forbidden('Удалить можно только свой комментарий')
  }

  await prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } })
}

export function countFor(entityType: string, entityId: string) {
  return prisma.comment.count({ where: { entityType, entityId, deletedAt: null } })
}
