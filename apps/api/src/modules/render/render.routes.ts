import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import {
  createRenderJobSchema,
  idParamSchema,
  renderListQuerySchema,
  updateRenderJobSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { buildMeta, sendItem, sendList, sendNoContent, toSkipTake } from '../../lib/http'
import { notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { recordActivity } from '../../lib/activity'
import { notify } from '../../lib/notify'
import { mountArchiveRoutes } from '../../lib/archive-routes'

const INCLUDE = {
  project: { select: { id: true, code: true, name: true } },
  shot: { select: { id: true, code: true } },
  version: { select: { id: true, label: true } },
  node: { select: { id: true, name: true, isOnline: true } },
  submittedBy: { select: { id: true, firstName: true, lastName: true } }
} satisfies Prisma.RenderJobInclude

export const renderRouter = Router()

renderRouter.use(authenticate)

renderRouter.get(
  '/',
  requirePermission(PERMISSION.RENDER_VIEW),
  validate(renderListQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<{
        page: number, limit: number, status?: string
        projectId?: string, shotId?: string, order: 'asc' | 'desc'
      }>(req)
      const { skip, take } = toSkipTake(query.page, query.limit)

      const where: Prisma.RenderJobWhereInput = {}
      if (query.status) where.status = query.status as never
      if (query.projectId) where.projectId = query.projectId
      if (query.shotId) where.shotId = query.shotId

      const [items, total] = await Promise.all([
        prisma.renderJob.findMany({
          where, skip, take,
          // Running first, then queued by priority: that is the operator's order.
          orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
          include: INCLUDE
        }),
        prisma.renderJob.count({ where })
      ])
      return sendList(res, items, buildMeta(total, query.page, query.limit))
    } catch (err) {
      next(err)
    }
  }
)

/** Farm nodes with their current load (spec 28). */
renderRouter.get(
  '/nodes',
  requirePermission(PERMISSION.RENDER_VIEW),
  async (_req, res, next) => {
    try {
      const nodes = await prisma.renderNode.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { jobs: true } } }
      })
      return sendItem(res, nodes)
    } catch (err) {
      next(err)
    }
  }
)

renderRouter.get(
  '/counts',
  requirePermission(PERMISSION.RENDER_VIEW),
  async (_req, res, next) => {
    try {
      const rows = await prisma.renderJob.groupBy({ by: ['status'], _count: { _all: true } })
      return sendItem(res, rows.map(row => ({ status: row.status, count: row._count._all })))
    } catch (err) {
      next(err)
    }
  }
)

renderRouter.get(
  '/:id',
  requirePermission(PERMISSION.RENDER_VIEW),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const job = await prisma.renderJob.findUnique({
        where: { id: req.params.id as string },
        include: {
          ...INCLUDE,
          version: { select: { id: true, label: true, status: true, fileUrl: true } }
        }
      })
      if (!job) throw notFound('Render job')
      return sendItem(res, job)
    } catch (err) {
      next(err)
    }
  }
)

renderRouter.post(
  '/',
  requirePermission(PERMISSION.RENDER_MANAGE),
  validate(createRenderJobSchema),
  async (req, res, next) => {
    try {
      const job = await prisma.renderJob.create({
        data: { ...req.body, submittedById: req.user?.id ?? null, status: 'QUEUED' },
        include: INCLUDE
      })
      await recordActivity({
        actorId: req.user?.id,
        entityType: 'RenderJob',
        entityId: job.id,
        projectId: job.projectId,
        action: 'render.queued',
        metadata: { shot: job.shot?.code }
      })
      return sendItem(res, job, 201)
    } catch (err) {
      next(err)
    }
  }
)

renderRouter.patch(
  '/:id',
  requirePermission(PERMISSION.RENDER_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateRenderJobSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const existing = await prisma.renderJob.findUnique({ where: { id }, include: INCLUDE })
      if (!existing) throw notFound('Render job')

      const data: Record<string, unknown> = { ...req.body }
      if (req.body.status === 'RENDERING' && !existing.startedAt) data.startedAt = new Date()
      if (req.body.status === 'COMPLETED') {
        data.completedAt = new Date()
        data.progress = 100
      }

      const job = await prisma.renderJob.update({ where: { id }, data, include: INCLUDE })

      // A failed render blocks delivery, so whoever queued it is told (spec 47).
      if (req.body.status === 'FAILED' && existing.submittedById) {
        await notify({
          userId: existing.submittedById,
          type: 'RENDER_FAILED',
          title: 'Рендер упал: ' + (existing.shot?.code ?? existing.project.code),
          body: req.body.errorMessage ?? null,
          linkUrl: '/render',
          entityType: 'RenderJob',
          entityId: id
        })
      }

      return sendItem(res, job)
    } catch (err) {
      next(err)
    }
  }
)

renderRouter.delete(
  '/:id',
  requirePermission(PERMISSION.RENDER_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      // Soft delete: the job stays auditable and can be restored.
      await prisma.renderJob.update({
        where: { id: req.params.id as string },
        data: { deletedAt: new Date() }
      })
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

// Archiving hides a row from the working set; deleting is the separate,
// confirmed action.
mountArchiveRoutes(renderRouter, {
  model: 'renderJob',
  entityType: 'RenderJob',
  permission: PERMISSION.RENDER_MANAGE
})
