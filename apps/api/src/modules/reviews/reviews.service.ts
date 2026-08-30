import type { Prisma } from '@prisma/client'
import type { ReviewDecisionInput } from '@astir/validation'
import { prisma } from '../../lib/prisma'
import { conflict, notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import { recordActivity } from '../../lib/activity'
import { notify } from '../../lib/notify'

const INCLUDE = {
  reviewer: { select: { id: true, firstName: true, lastName: true } },
  version: {
    select: {
      id: true,
      versionNumber: true,
      label: true,
      status: true,
      fileUrl: true,
      previewUrl: true,
      mimeType: true,
      notes: true,
      createdAt: true,
      uploadedBy: { select: { id: true, firstName: true, lastName: true } },
      project: { select: { id: true, code: true, name: true } },
      shot: { select: { id: true, code: true } },
      task: { select: { id: true, title: true } }
    }
  }
} satisfies Prisma.ReviewInclude

export interface ReviewListQuery {
  page: number
  limit: number
  status?: string
  reviewType?: string
  projectId?: string
  shotId?: string
  reviewerId?: string
  order: 'asc' | 'desc'
}

function buildWhere(query: Partial<ReviewListQuery>): Prisma.ReviewWhereInput {
  const where: Prisma.ReviewWhereInput = {}
  if (query.status) where.status = query.status as Prisma.ReviewWhereInput['status']
  if (query.reviewType) where.reviewType = query.reviewType as Prisma.ReviewWhereInput['reviewType']
  if (query.reviewerId) where.reviewerId = query.reviewerId
  if (query.projectId || query.shotId) {
    where.version = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.shotId ? { shotId: query.shotId } : {})
    }
  }
  return where
}

/**
 * Close reviews whose discussion window has passed.
 *
 * Runs before a read rather than on a schedule: this app has no job runner,
 * and a review that nobody opens does not need to change state until someone
 * actually looks at the list.
 */
export async function expireOverdue() {
  const result = await prisma.review.updateMany({
    where: {
      status: { in: ['PENDING', 'IN_REVIEW'] },
      deadline: { not: null, lt: new Date() }
    },
    data: { status: 'EXPIRED', completedAt: new Date() }
  })
  return result.count
}

export async function list(query: ReviewListQuery) {
  await expireOverdue()
  const { skip, take } = toSkipTake(query.page, query.limit)
  const where = buildWhere(query)
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      skip,
      take,
      // Oldest first: a review waiting longest should be handled first.
      orderBy: [{ status: 'asc' }, { createdAt: query.order }],
      include: INCLUDE
    }),
    prisma.review.count({ where })
  ])
  return { items, meta: buildMeta(total, query.page, query.limit) }
}

export async function getById(id: string) {
  await expireOverdue()
  const review = await prisma.review.findUnique({ where: { id }, include: INCLUDE })
  if (!review) throw notFound('Review')
  return review
}

/** Counts per status, for the filter chips on the page. */
export async function counts() {
  const rows = await prisma.review.groupBy({
    by: ['status'],
    _count: { _all: true }
  })
  return rows.map(row => ({ status: row.status, count: row._count._all }))
}

const TERMINAL = new Set(['APPROVED', 'REJECTED'])

/**
 * Record a decision (spec 22, 72).
 *
 * Everything moves together: the review, the version, any linked task, the
 * revision a rejection opens, the activity entry and the notification. If any
 * step fails nothing is written, so a version can never sit APPROVED with no
 * review to explain it.
 */
export async function decide(
  id: string,
  input: ReviewDecisionInput,
  actorId?: string
) {
  const review = await getById(id)
  if (TERMINAL.has(review.status)) {
    throw conflict('Это согласование уже завершено')
  }

  const version = review.version
  const now = new Date()

  await prisma.$transaction(async tx => {
    await tx.review.update({
      where: { id },
      data: {
        status: input.decision as never,
        comment: input.comment ?? review.comment,
        reviewerId: review.reviewerId ?? actorId ?? null,
        completedAt: now
      }
    })

    await tx.version.update({
      where: { id: version.id },
      data: { status: input.decision as never }
    })

    if (input.decision === 'APPROVED') {
      // Only one approved version per shot: the previous one steps aside.
      if (version.shot) {
        await tx.version.updateMany({
          where: {
            shotId: version.shot.id,
            id: { not: version.id },
            status: { in: ['APPROVED', 'SUBMITTED', 'IN_REVIEW'] }
          },
          data: { status: 'SUPERSEDED' }
        })
      }
      if (version.task) {
        await tx.task.update({ where: { id: version.task.id }, data: { status: 'APPROVED' } })
      }
    }

    if (input.decision === 'CHANGES_REQUESTED') {
      const previous = await tx.revision.aggregate({
        where: { versionId: version.id },
        _max: { round: true }
      })

      await tx.revision.create({
        data: {
          projectId: version.project.id,
          shotId: version.shot?.id ?? null,
          taskId: version.task?.id ?? null,
          versionId: version.id,
          round: (previous._max.round ?? 0) + 1,
          title: 'Правки по ' + (version.shot?.code ?? version.label),
          description: input.comment ?? null,
          requestedById: actorId ?? null,
          assignedToId: version.uploadedBy?.id ?? null,
          status: 'OPEN',
          deadline: input.revisionDeadline ? new Date(input.revisionDeadline) : null
        }
      })

      if (version.task) {
        await tx.task.update({ where: { id: version.task.id }, data: { status: 'REVISION' } })
      }
    }

    await recordActivity(
      {
        actorId,
        entityType: 'Review',
        entityId: id,
        projectId: version.project.id,
        action: 'review.' + input.decision.toLowerCase(),
        metadata: { version: version.label, shot: version.shot?.code }
      },
      tx
    )
  })

  // Telling the author is best-effort; it must not undo the decision.
  if (version.uploadedBy && version.uploadedBy.id !== actorId) {
    const titles: Record<string, string> = {
      APPROVED: 'Версия согласована: ',
      CHANGES_REQUESTED: 'Запрошены правки: ',
      REJECTED: 'Версия отклонена: '
    }
    await notify({
      userId: version.uploadedBy.id,
      type: input.decision === 'APPROVED' ? 'VERSION_APPROVED' : 'CHANGES_REQUESTED',
      title: (titles[input.decision] ?? '') + version.label,
      body: input.comment ?? version.project.code,
      linkUrl: '/reviews?review=' + id,
      entityType: 'Review',
      entityId: id
    })
  }

  return getById(id)
}

/** Claim an unassigned review and move it into IN_REVIEW. */
export async function claim(id: string, actorId?: string) {
  const review = await getById(id)
  if (TERMINAL.has(review.status)) throw conflict('Это согласование уже завершено')

  await prisma.review.update({
    where: { id },
    data: { status: 'IN_REVIEW', reviewerId: review.reviewerId ?? actorId ?? null }
  })
  return getById(id)
}
