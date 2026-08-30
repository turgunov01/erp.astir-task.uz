import { Router } from 'express'
import { z } from 'zod'
import {
  createRevisionSchema,
  idParamSchema,
  revisionListQuerySchema,
  updateRevisionSchema,
  uuidSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import * as service from './revisions.service'
import { mountArchiveRoutes } from '../../lib/archive-routes'

export const revisionsRouter = Router()

revisionsRouter.use(authenticate)

revisionsRouter.get(
  '/',
  requirePermission(PERMISSION.REVISION_VIEW),
  validate(revisionListQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<Record<string, unknown>>(req)
      if (query.mine) query.assignedToId = req.user?.id
      const result = await service.list(query as never)
      return sendList(res, result.items, result.meta)
    } catch (err) {
      next(err)
    }
  }
)

revisionsRouter.get(
  '/counts',
  requirePermission(PERMISSION.REVISION_VIEW),
  async (_req, res, next) => {
    try {
      return sendItem(res, await service.counts())
    } catch (err) {
      next(err)
    }
  }
)

/** Revision rounds per project (spec 24 reporting). */
revisionsRouter.get(
  '/rounds',
  requirePermission(PERMISSION.REVISION_VIEW),
  validate(z.object({ projectId: uuidSchema }), 'query'),
  async (req, res, next) => {
    try {
      const { projectId } = validatedQuery<{ projectId: string }>(req)
      return sendItem(res, await service.roundsByProject(projectId))
    } catch (err) {
      next(err)
    }
  }
)

revisionsRouter.get(
  '/:id',
  requirePermission(PERMISSION.REVISION_VIEW),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.getById(req.params.id as string))
    } catch (err) {
      next(err)
    }
  }
)

revisionsRouter.post(
  '/',
  requirePermission(PERMISSION.REVISION_MANAGE),
  validate(createRevisionSchema),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.create(req.body, req.user?.id), 201)
    } catch (err) {
      next(err)
    }
  }
)

// Artists move their own revision forward, so this uses the lighter permission.
revisionsRouter.patch(
  '/:id',
  requirePermission(PERMISSION.TASK_UPDATE),
  validate(idParamSchema, 'params'),
  validate(updateRevisionSchema),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.update(req.params.id as string, req.body, req.user?.id))
    } catch (err) {
      next(err)
    }
  }
)

revisionsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.REVISION_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      await service.remove(req.params.id as string, req.user?.id)
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

// Archiving hides a row from the working set; deleting is the separate,
// confirmed action.
mountArchiveRoutes(revisionsRouter, {
  model: 'revision',
  entityType: 'Revision',
  permission: PERMISSION.REVISION_MANAGE
})
