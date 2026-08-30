import { Router } from 'express'
import { z } from 'zod'
import {
  createShotSchema,
  idParamSchema,
  shotListQuerySchema,
  updateShotSchema,
  updateShotStageSchema,
  uuidSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import * as controller from './shots.controller'
import { mountArchiveRoutes } from '../../lib/archive-routes'

const stageParamSchema = z.object({ id: uuidSchema, stageId: uuidSchema })

export const shotsRouter = Router()

shotsRouter.use(authenticate)

shotsRouter.get(
  '/',
  requirePermission(PERMISSION.PRODUCTION_VIEW),
  validate(shotListQuerySchema, 'query'),
  controller.listHandler
)

shotsRouter.get(
  '/:id',
  requirePermission(PERMISSION.PRODUCTION_VIEW),
  validate(idParamSchema, 'params'),
  controller.getHandler
)

shotsRouter.post(
  '/',
  requirePermission(PERMISSION.PRODUCTION_MANAGE),
  validate(createShotSchema),
  controller.createHandler
)

shotsRouter.patch(
  '/:id',
  requirePermission(PERMISSION.PRODUCTION_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateShotSchema),
  controller.updateHandler
)

// An artist moves their own stage forward, so this needs the lighter permission.
shotsRouter.patch(
  '/:id/stages/:stageId',
  requirePermission(PERMISSION.TASK_UPDATE),
  validate(stageParamSchema, 'params'),
  validate(updateShotStageSchema),
  controller.updateStageHandler
)

shotsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.PRODUCTION_MANAGE),
  validate(idParamSchema, 'params'),
  controller.removeHandler
)

// Archiving hides a row from the working set; deleting is the separate,
// confirmed action.
mountArchiveRoutes(shotsRouter, {
  model: 'shot',
  entityType: 'Shot',
  permission: PERMISSION.PRODUCTION_MANAGE
})
