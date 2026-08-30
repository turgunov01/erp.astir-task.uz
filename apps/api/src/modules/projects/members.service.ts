import { prisma } from '../../lib/prisma'
import { conflict, notFound } from '../../lib/errors'
import { recordActivity } from '../../lib/activity'

const MEMBER_INCLUDE = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      avatarUrl: true,
      employee: {
        select: {
          position: true,
          department: { select: { id: true, name: true } }
        }
      }
    }
  }
}

export function list(projectId: string) {
  return prisma.projectMember.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    include: MEMBER_INCLUDE
  })
}

/**
 * Attach a person to a project.
 *
 * The unique constraint on (projectId, userId) is the real guard; checking
 * first only lets us return a clear message instead of a raw P2002.
 */
export async function add(
  projectId: string,
  input: { userId: string, roleLabel?: string | null },
  actorId?: string
) {
  const [project, user] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true }
    }),
    prisma.user.findFirst({
      where: { id: input.userId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, isActive: true }
    })
  ])

  if (!project) throw notFound('Project')
  if (!user) throw notFound('User')
  if (!user.isActive) throw conflict('That account is disabled')

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: input.userId } },
    select: { id: true }
  })
  if (existing) throw conflict('This person is already on the project')

  const member = await prisma.projectMember.create({
    data: { projectId, userId: input.userId, roleLabel: input.roleLabel ?? null },
    include: MEMBER_INCLUDE
  })

  await recordActivity({
    actorId,
    entityType: 'ProjectMember',
    entityId: member.id,
    projectId,
    action: 'member.added',
    metadata: {
      name: user.firstName + ' ' + user.lastName,
      roleLabel: input.roleLabel ?? undefined
    }
  })

  return member
}

export async function updateRoleLabel(
  projectId: string,
  userId: string,
  roleLabel: string | null
) {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true }
  })
  if (!member) throw notFound('Project member')

  return prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { roleLabel },
    include: MEMBER_INCLUDE
  })
}

/**
 * Detach a person.
 *
 * Refused while they still hold open work on the project: removing them would
 * leave tasks assigned to someone who is no longer on the roster.
 */
export async function remove(projectId: string, userId: string, actorId?: string) {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { user: { select: { firstName: true, lastName: true } } }
  })
  if (!member) throw notFound('Project member')

  const openTasks = await prisma.task.count({
    where: {
      projectId,
      assigneeId: userId,
      deletedAt: null,
      status: { notIn: ['DONE', 'APPROVED'] }
    }
  })
  if (openTasks > 0) {
    throw conflict(
      'This person still has ' + openTasks + ' open task(s). Reassign them first.'
    )
  }

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } }
  })

  await recordActivity({
    actorId,
    entityType: 'ProjectMember',
    entityId: member.id,
    projectId,
    action: 'member.removed',
    metadata: { name: member.user.firstName + ' ' + member.user.lastName }
  })
}

/** Candidates not yet on the project, for the add-member picker. */
export async function available(projectId: string) {
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true }
  })
  const taken = members.map(member => member.userId)

  return prisma.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      role: { not: 'CLIENT' },
      ...(taken.length > 0 ? { id: { notIn: taken } } : {})
    },
    orderBy: [{ firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      employee: { select: { position: true } }
    }
  })
}
