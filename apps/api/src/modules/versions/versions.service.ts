import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { conflict, forbidden, notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import { recordActivity } from '../../lib/activity'
import { notify } from '../../lib/notify'
import { storage } from '../../lib/storage'

const INCLUDE = {
  project: { select: { id: true, code: true, name: true } },
  shot: { select: { id: true, code: true } },
  task: { select: { id: true, title: true } },
  asset: { select: { id: true, name: true } },
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
  reviews: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true, reviewType: true, status: true, comment: true, completedAt: true,
      reviewer: { select: { firstName: true, lastName: true } }
    }
  }
} satisfies Prisma.VersionInclude

const { reviews: _reviews, ...LIST_INCLUDE } = INCLUDE

export interface VersionListQuery {
  page: number
  limit: number
  status?: string
  projectId?: string
  shotId?: string
  taskId?: string
  assetId?: string
  order: 'asc' | 'desc'
}

function buildWhere(query: Partial<VersionListQuery>): Prisma.VersionWhereInput {
  const where: Prisma.VersionWhereInput = {}
  if (query.status) where.status = query.status as Prisma.VersionWhereInput['status']
  if (query.projectId) where.projectId = query.projectId
  if (query.shotId) where.shotId = query.shotId
  if (query.taskId) where.taskId = query.taskId
  if (query.assetId) where.assetId = query.assetId
  return where
}

export async function list(query: VersionListQuery) {
  const { skip, take } = toSkipTake(query.page, query.limit)
  const where = buildWhere(query)
  const [items, total] = await Promise.all([
    prisma.version.findMany({
      where, skip, take,
      orderBy: [{ createdAt: query.order }],
      // The review history is detail-only: carrying it on every list row
      // roughly doubled the payload for data the table never shows.
      include: LIST_INCLUDE
    }),
    prisma.version.count({ where })
  ])
  return { items, meta: buildMeta(total, query.page, query.limit) }
}

export async function getById(id: string) {
  const version = await prisma.version.findUnique({ where: { id }, include: INCLUDE })
  if (!version) throw notFound('Version')
  return version
}

/**
 * The three versions a shot page must never conflate (spec 20).
 * Each answers a different question: what exists, what waits, what is signed off.
 */
export async function latestFor(params: { shotId?: string, taskId?: string, assetId?: string }) {
  const where: Prisma.VersionWhereInput = {}
  if (params.shotId) where.shotId = params.shotId
  if (params.taskId) where.taskId = params.taskId
  if (params.assetId) where.assetId = params.assetId
  if (Object.keys(where).length === 0) throw notFound('Target')

  const pick = (extra: Prisma.VersionWhereInput) =>
    prisma.version.findFirst({
      where: { ...where, ...extra },
      orderBy: { versionNumber: 'desc' },
      include: INCLUDE
    })

  const [latest, submitted, approved] = await Promise.all([
    pick({}),
    pick({ status: { in: ['SUBMITTED', 'IN_REVIEW'] } }),
    pick({ status: 'APPROVED' })
  ])

  return { latest, submitted, approved }
}

/** Next version number within the shot, task or asset the version belongs to. */
async function nextNumber(input: {
  shotId?: string | null
  taskId?: string | null
  assetId?: string | null
  projectId: string
}) {
  const scope: Prisma.VersionWhereInput = input.shotId
    ? { shotId: input.shotId }
    : input.taskId
      ? { taskId: input.taskId }
      : input.assetId
        ? { assetId: input.assetId }
        : { projectId: input.projectId, shotId: null, taskId: null, assetId: null }

  const highest = await prisma.version.aggregate({ where: scope, _max: { versionNumber: true } })
  return (highest._max.versionNumber ?? 0) + 1
}

export interface CreateVersionInput {
  projectId: string
  shotId?: string | null
  taskId?: string | null
  assetId?: string | null
  notes?: string | null
  label?: string
  file?: { buffer: Buffer, originalname: string, mimetype: string }
}

export async function create(input: CreateVersionInput, actorId?: string) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, deletedAt: null },
    select: { id: true, code: true }
  })
  if (!project) throw notFound('Project')

  const shot = input.shotId
    ? await prisma.shot.findUnique({ where: { id: input.shotId }, select: { id: true, code: true } })
    : null
  if (input.shotId && !shot) throw notFound('Shot')

  const versionNumber = await nextNumber(input)
  const base = shot?.code ?? project.code
  const suffix = input.label?.trim() || 'work'
  const label = base + '_' + suffix + '_v' + String(versionNumber).padStart(3, '0')

  let stored = null
  if (input.file) {
    stored = await storage.save({
      buffer: input.file.buffer,
      originalName: input.file.originalname,
      mimeType: input.file.mimetype,
      prefix: 'versions/' + input.projectId
    })
  }

  const version = await prisma.version.create({
    data: {
      projectId: input.projectId,
      shotId: input.shotId ?? null,
      taskId: input.taskId ?? null,
      assetId: input.assetId ?? null,
      versionNumber,
      label,
      notes: input.notes ?? null,
      status: 'WORKING',
      uploadedById: actorId ?? null,
      fileUrl: stored ? stored.url : null,
      fileName: stored ? stored.originalName : null,
      fileSize: stored ? BigInt(stored.size) : null,
      mimeType: stored ? stored.mimeType : null
    },
    include: INCLUDE
  })

  await recordActivity({
    actorId,
    entityType: 'Version',
    entityId: version.id,
    projectId: input.projectId,
    action: 'version.created',
    metadata: { label }
  })

  return version
}

/**
 * Send a version for review (spec 19 to 21).
 *
 * The version move and the review row are written together, so a version can
 * never read SUBMITTED with nothing queued to look at it.
 */
export async function submit(
  id: string,
  input: { reviewType: string, reviewerId?: string | null, comment?: string | null },
  actorId?: string
) {
  const version = await getById(id)
  if (['SUBMITTED', 'IN_REVIEW', 'APPROVED'].includes(version.status)) {
    throw conflict('Эта версия уже отправлена на согласование')
  }

  await prisma.$transaction(async tx => {
    await tx.version.update({ where: { id }, data: { status: 'SUBMITTED' } })
    await tx.review.create({
      data: {
        versionId: id,
        reviewType: input.reviewType as never,
        status: 'PENDING',
        reviewerId: input.reviewerId ?? null,
        comment: input.comment ?? null
      }
    })
    if (version.task) {
      await tx.task.update({ where: { id: version.task.id }, data: { status: 'REVIEW' } })
    }
    await recordActivity(
      {
        actorId,
        entityType: 'Version',
        entityId: id,
        projectId: version.project.id,
        action: 'version.submitted',
        metadata: { label: version.label, reviewType: input.reviewType }
      },
      tx
    )
  })

  if (input.reviewerId && input.reviewerId !== actorId) {
    await notify({
      userId: input.reviewerId,
      type: 'VERSION_SUBMITTED',
      title: 'На согласование: ' + version.label,
      body: version.project.code,
      linkUrl: '/reviews',
      entityType: 'Version',
      entityId: id
    })
  }

  return getById(id)
}

/**
 * Approved versions are protected from artist deletion (spec 19): removing the
 * signed-off take would erase the only record of what was accepted.
 */
export async function remove(id: string, role: string | undefined, actorId?: string) {
  const version = await getById(id)
  const privileged = ['OWNER', 'ADMIN', 'PRODUCER', 'PROJECT_MANAGER'].includes(role ?? '')
  if (version.status === 'APPROVED' && !privileged) {
    throw forbidden('Согласованную версию может удалить только продакшн')
  }

  await prisma.version.delete({ where: { id } })
  if (version.fileUrl && version.fileUrl.startsWith('/uploads/')) {
    await storage.remove(version.fileUrl.replace('/uploads/', ''))
  }

  await recordActivity({
    actorId,
    entityType: 'Version',
    entityId: id,
    projectId: version.project.id,
    action: 'version.deleted',
    metadata: { label: version.label }
  })
}
