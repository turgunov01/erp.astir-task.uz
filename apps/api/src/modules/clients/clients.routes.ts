import { Router } from 'express'
import {
  clientListQuerySchema,
  createClientSchema,
  idParamSchema,
  updateClientSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import * as controller from './clients.controller'
import { mountArchiveRoutes } from '../../lib/archive-routes'

export const clientsRouter = Router()

clientsRouter.use(authenticate)

clientsRouter.get(
  '/',
  requirePermission(PERMISSION.CLIENT_VIEW),
  validate(clientListQuerySchema, 'query'),
  controller.listHandler
)

clientsRouter.get(
  '/:id',
  requirePermission(PERMISSION.CLIENT_VIEW),
  validate(idParamSchema, 'params'),
  controller.getHandler
)

clientsRouter.post(
  '/',
  requirePermission(PERMISSION.CLIENT_MANAGE),
  validate(createClientSchema),
  controller.createHandler
)

clientsRouter.patch(
  '/:id',
  requirePermission(PERMISSION.CLIENT_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateClientSchema),
  controller.updateHandler
)

clientsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.CLIENT_MANAGE),
  validate(idParamSchema, 'params'),
  controller.archiveHandler
)

// Archiving hides a row from the working set; deleting is the separate,
// confirmed action.
mountArchiveRoutes(clientsRouter, {
  model: 'client',
  entityType: 'Client',
  permission: PERMISSION.CLIENT_MANAGE
})
