import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import { recordActivity } from '../../lib/activity'
import { notify } from '../../lib/notify'

const INCLUDE = {
  project: { select: { id: true, code: true, name: true } },
  shot: { select: { id: true, code: true } },
  task: { select: { id: true, title: true } },
  version: { select: { id: true, label: true, status: true } },
  requestedBy: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } }
} satisfies Prisma.RevisionInclude

export interface RevisionListQuery {
  page: number
  limit: number
  status?: string
  projectId?: string
  shotId?: string
  assignedToId?: string
  order: 'asc' | 'desc'
}

function buildWhere(query: Partial<RevisionListQuery>): Prisma.RevisionWhereInput {
  const where: Prisma.RevisionWhereInput = {}
  if (query.status) where.status = query.status as Prisma.RevisionWhereInput['status']
  if (query.projectId) where.projectId = query.projectId
  if (query.shotId) where.shotId = query.shotId
  if (query.assignedToId) where.assignedToId = query.assignedToId
  return where
}

export async function list(query: RevisionListQuery) {
  const { skip, take } = toSkipTake(query.page, query.limit)
  const where = buildWhere(query)
  const [items, total] = await Promise.all([
    prisma.revision.findMany({
      where,
      skip,
      take,
      // Open work first, then by age: the oldest unresolved is the one to act on.
      orderBy: [{ status: 'asc' }, { createdAt: query.order }],
      include: INCLUDE
    }),
    prisma.revision.count({ where })
  ])
  return { items, meta: buildMeta(total, query.page, query.limit) }
}

export async function getById(id: string) {
  const revision = await prisma.revision.findUnique({ where: { id }, include: INCLUDE })
  if (!revision) throw notFound('Revision')
  return revision
}

export async function counts() {
  const rows = await prisma.revision.groupBy({ by: ['status'], _count: { _all: true } })
  return rows.map(row => ({ status: row.status, count: row._count._all }))
}

/** Revision rounds per project, for the reporting requirement in spec 24. */
export async function roundsByProject(projectId: string) {
  const rows = await prisma.revision.groupBy({
    by: ['round'],
    where: { projectId },
    _count: { _all: true },
    orderBy: { round: 'asc' }
  })
  return rows.map(row => ({ round: row.round, count: row._count._all }))
}

function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null
}

export async function create(input: Record<string, unknown>, actorId?: string) {
  const projectId = input.projectId as string
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, code: true }
  })
  if (!project) throw notFound('Project')

  // Round continues the sequence for the version, or the shot when standalone.
  const previous = await prisma.revision.aggregate({
    where: input.versionId
      ? { versionId: input.versionId as string }
      : { projectId, shotId: (input.shotId as string) ?? null },
    _max: { round: true }
  })

  const revision = await prisma.revision.create({
    data: {
      projectId,
      shotId: (input.shotId as string) ?? null,
      taskId: (input.taskId as string) ?? null,
      versionId: (input.versionId as string) ?? null,
      round: (previous._max.round ?? 0) + 1,
      title: input.title as string,
      description: (input.description as string) ?? null,
      requestedById: actorId ?? null,
      assignedToId: (input.assignedToId as string) ?? null,
      priority: (input.priority as never) ?? 'NORMAL',
      status: 'OPEN',
      deadline: toDate(input.deadline as string | null)
    },
    include: INCLUDE
  })

  await recordActivity({
    actorId,
    entityType: 'Revision',
    entityId: revision.id,
    projectId,
    action: 'revision.created',
    metadata: { title: revision.title, round: revision.round }
  })

  if (revision.assignedToId && revision.assignedToId !== actorId) {
    await notify({
      userId: revision.assignedToId,
      type: 'REVISION_CREATED',
      title: 'Новая правка: ' + revision.title,
      body: project.code + ' · раунд ' + revision.round,
      linkUrl: '/revisions?revision=' + revision.id,
      entityType: 'Revision',
      entityId: revision.id
    })
  }

  return revision
}

export async function update(id: string, input: Record<string, unknown>, actorId?: string) {
  const existing = await getById(id)

  const data: Record<string, unknown> = { ...input }
  if ('deadline' in input) data.deadline = toDate(input.deadline as string | null)
  // Closing a revision stamps when it happened, so cycle time is measurable.
  if (input.status === 'COMPLETED' && !existing.completedAt) data.completedAt = new Date()
  if (input.status && input.status !== 'COMPLETED') data.completedAt = null

  const revision = await prisma.revision.update({ where: { id }, data, include: INCLUDE })

  if (input.status && input.status !== existing.status) {
    await recordActivity({
      actorId,
      entityType: 'Revision',
      entityId: id,
      projectId: existing.projectId,
      action: 'revision.status_changed',
      metadata: { from: existing.status, to: input.status }
    })
  }

  if (input.assignedToId && input.assignedToId !== existing.assignedToId) {
    await notify({
      userId: input.assignedToId as string,
      type: 'REVISION_CREATED',
      title: 'Вам назначена правка: ' + existing.title,
      body: existing.project.code,
      linkUrl: '/revisions?revision=' + id,
      entityType: 'Revision',
      entityId: id
    })
  }

  return revision
}

export async function remove(id: string, actorId?: string) {
  const revision = await getById(id)
  // Soft delete: a removed revision stays auditable and can be restored.
  await prisma.revision.update({ where: { id }, data: { deletedAt: new Date() } })
  await recordActivity({
    actorId,
    entityType: 'Revision',
    entityId: id,
    projectId: revision.projectId,
    action: 'revision.deleted',
    metadata: { title: revision.title }
  })
}
