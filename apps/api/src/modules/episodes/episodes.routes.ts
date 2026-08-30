import { Router } from 'express'
import {
  createEpisodeSchema,
  episodeListQuerySchema,
  idParamSchema,
  updateEpisodeSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import * as service from './episodes.service'
import { mountArchiveRoutes } from '../../lib/archive-routes'

export const episodesRouter = Router()

episodesRouter.use(authenticate)

episodesRouter.get(
  '/',
  requirePermission(PERMISSION.PRODUCTION_VIEW),
  validate(episodeListQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const result = await service.list(validatedQuery<never>(req))
      return sendList(res, result.items, result.meta)
    } catch (err) {
      next(err)
    }
  }
)

episodesRouter.get(
  '/:id',
  requirePermission(PERMISSION.PRODUCTION_VIEW),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.getById(req.params.id as string))
    } catch (err) {
      next(err)
    }
  }
)

episodesRouter.post(
  '/',
  requirePermission(PERMISSION.PRODUCTION_MANAGE),
  validate(createEpisodeSchema),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.create(req.body, req.user?.id), 201)
    } catch (err) {
      next(err)
    }
  }
)

episodesRouter.patch(
  '/:id',
  requirePermission(PERMISSION.PRODUCTION_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateEpisodeSchema),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.update(req.params.id as string, req.body, req.user?.id))
    } catch (err) {
      next(err)
    }
  }
)

episodesRouter.post(
  '/:id/refresh',
  requirePermission(PERMISSION.PRODUCTION_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.refresh(req.params.id as string))
    } catch (err) {
      next(err)
    }
  }
)

episodesRouter.delete(
  '/:id',
  requirePermission(PERMISSION.PRODUCTION_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      await service.remove(req.params.id as string)
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

// Archiving hides a row from the working set; deleting is the separate,
// confirmed action.
mountArchiveRoutes(episodesRouter, {
  model: 'episode',
  entityType: 'Episode',
  permission: PERMISSION.PRODUCTION_MANAGE
})
