import { Router } from 'express'
import { z } from 'zod'
import {
  idParamSchema,
  reviewDecisionSchema,
  reviewListQuerySchema,
  uuidSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { forbidden, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { recordActivity } from '../../lib/activity'
import * as service from './reviews.service'
import { mountArchiveRoutes } from '../../lib/archive-routes'

export const reviewsRouter = Router()

reviewsRouter.use(authenticate)

reviewsRouter.get(
  '/',
  requirePermission(PERMISSION.REVIEW_VIEW),
  validate(reviewListQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<Record<string, unknown>>(req)
      if (query.mine) query.reviewerId = req.user?.id
      // A client sees only client-facing reviews, never internal notes.
      if (req.user?.role === 'CLIENT') query.reviewType = 'CLIENT'
      const result = await service.list(query as never)
      return sendList(res, result.items, result.meta)
    } catch (err) {
      next(err)
    }
  }
)

reviewsRouter.get(
  '/counts',
  requirePermission(PERMISSION.REVIEW_VIEW),
  async (_req, res, next) => {
    try {
      return sendItem(res, await service.counts())
    } catch (err) {
      next(err)
    }
  }
)

reviewsRouter.get(
  '/:id',
  requirePermission(PERMISSION.REVIEW_VIEW),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.getById(req.params.id as string))
    } catch (err) {
      next(err)
    }
  }
)

reviewsRouter.post(
  '/:id/claim',
  requirePermission(PERMISSION.REVIEW_INTERNAL),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.claim(req.params.id as string, req.user?.id))
    } catch (err) {
      next(err)
    }
  }
)

/**
 * Deciding needs the permission matching the review type: a client may only
 * close a CLIENT review, internal staff may not sign off on the client's behalf.
 */
reviewsRouter.post(
  '/:id/decision',
  requirePermission(PERMISSION.REVIEW_VIEW),
  validate(idParamSchema, 'params'),
  validate(reviewDecisionSchema),
  async (req, res, next) => {
    try {
      const review = await service.getById(req.params.id as string)
      const isClientReview = review.reviewType === 'CLIENT'
      const role = req.user?.role

      if (isClientReview && role !== 'CLIENT' && role !== 'OWNER' && role !== 'ADMIN') {
        throw forbidden('Клиентское согласование закрывает клиент')
      }
      if (!isClientReview && role === 'CLIENT') {
        throw forbidden('Внутреннее согласование недоступно клиенту')
      }

      const updated = await service.decide(
        req.params.id as string,
        req.body,
        req.user?.id
      )
      return sendItem(res, updated)
    } catch (err) {
      next(err)
    }
  }
)

/** Sending a version out for review is how a review comes into being. */
const createReviewSchema = z.object({
  versionId: uuidSchema,
  reviewType: z.enum(['INTERNAL', 'CLIENT']).default('INTERNAL'),
  reviewerId: uuidSchema.optional().nullable(),
  comment: z.string().trim().max(2000).optional().nullable(),
  /** Discussion window; passing it without a decision closes the review. */
  deadline: z.string().trim().optional().nullable()
})

reviewsRouter.post(
  '/',
  requirePermission(PERMISSION.REVIEW_INTERNAL),
  validate(createReviewSchema),
  async (req, res, next) => {
    try {
      const version = await prisma.version.findUnique({
        where: { id: req.body.versionId },
        select: { id: true, projectId: true }
      })
      if (!version) throw notFound('Version')

      const review = await prisma.review.create({
        data: {
          versionId: version.id,
          reviewType: req.body.reviewType,
          reviewerId: req.body.reviewerId ?? null,
          comment: req.body.comment ?? null,
          deadline: req.body.deadline ? new Date(req.body.deadline) : null
        },
        include: {
          reviewer: { select: { id: true, firstName: true, lastName: true } },
          version: { select: { id: true, label: true, status: true } }
        }
      })

      await recordActivity({
        actorId: req.user?.id,
        entityType: 'Review',
        entityId: review.id,
        action: 'created',
        projectId: version.projectId
      })

      return sendItem(res, review, 201)
    } catch (err) {
      next(err)
    }
  }
)

/** Editing a review means moving its deadline or its reviewer, not deciding it. */
const updateReviewSchema = z.object({
  reviewType: z.enum(['INTERNAL', 'ART_DIRECTOR', 'CLIENT', 'FINAL']).optional(),
  reviewerId: uuidSchema.optional().nullable(),
  comment: z.string().trim().max(2000).optional().nullable(),
  deadline: z.string().trim().optional().nullable()
})

reviewsRouter.patch(
  '/:id',
  requirePermission(PERMISSION.REVIEW_INTERNAL),
  validate(idParamSchema, 'params'),
  validate(updateReviewSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const existing = await prisma.review.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw notFound('Review')

      const data: Record<string, unknown> = {}
      if ('reviewType' in req.body) data.reviewType = req.body.reviewType
      if ('reviewerId' in req.body) data.reviewerId = req.body.reviewerId ?? null
      if ('comment' in req.body) data.comment = req.body.comment ?? null
      if ('deadline' in req.body) {
        const deadline = req.body.deadline ? new Date(req.body.deadline) : null
        data.deadline = deadline
        /*
         * Giving an expired review a future deadline reopens it. Without this
         * the discussion could never be resumed once the window lapsed, and
         * the work already in its comments would be stranded.
         */
        if (existing.status === 'EXPIRED' && deadline && deadline > new Date()) {
          data.status = 'PENDING'
          data.completedAt = null
        }
      }

      const review = await prisma.review.update({
        where: { id },
        data,
        include: {
          reviewer: { select: { id: true, firstName: true, lastName: true } },
          version: { select: { id: true, label: true, status: true } }
        }
      })

      await recordActivity({
        actorId: req.user?.id,
        entityType: 'Review',
        entityId: id,
        action: 'updated'
      })

      return sendItem(res, review)
    } catch (err) {
      next(err)
    }
  }
)

reviewsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.REVIEW_INTERNAL),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const existing = await prisma.review.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw notFound('Review')

      await prisma.review.update({ where: { id }, data: { deletedAt: new Date() } })
      await recordActivity({
        actorId: req.user?.id,
        entityType: 'Review',
        entityId: id,
        action: 'deleted'
      })

      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

// Archiving hides a row from the working set; deleting is the separate,
// confirmed action.
mountArchiveRoutes(reviewsRouter, {
  model: 'review',
  entityType: 'Review',
  permission: PERMISSION.REVIEW_INTERNAL
})
