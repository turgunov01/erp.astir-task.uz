import { Router } from 'express'
import {
  createSceneSchema,
  idParamSchema,
  sceneListQuerySchema,
  updateSceneSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import * as service from './scenes.service'
import { mountArchiveRoutes } from '../../lib/archive-routes'

export const scenesRouter = Router()

scenesRouter.use(authenticate)

scenesRouter.get(
  '/',
  requirePermission(PERMISSION.PRODUCTION_VIEW),
  validate(sceneListQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const result = await service.list(validatedQuery<never>(req))
      return sendList(res, result.items, result.meta)
    } catch (err) {
      next(err)
    }
  }
)

scenesRouter.get(
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

scenesRouter.post(
  '/',
  requirePermission(PERMISSION.PRODUCTION_MANAGE),
  validate(createSceneSchema),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.create(req.body, req.user?.id), 201)
    } catch (err) {
      next(err)
    }
  }
)

scenesRouter.patch(
  '/:id',
  requirePermission(PERMISSION.PRODUCTION_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateSceneSchema),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.update(req.params.id as string, req.body, req.user?.id))
    } catch (err) {
      next(err)
    }
  }
)

scenesRouter.delete(
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
mountArchiveRoutes(scenesRouter, {
  model: 'scene',
  entityType: 'Scene',
  permission: PERMISSION.PRODUCTION_MANAGE
})
