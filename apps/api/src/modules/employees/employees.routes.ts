import { Router } from 'express'
import {
  createEmployeeSchema,
  employeeListQuerySchema,
  idParamSchema,
  updateEmployeeSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import * as controller from './employees.controller'
import { mountArchiveRoutes } from '../../lib/archive-routes'

export const employeesRouter = Router()

employeesRouter.use(authenticate)

employeesRouter.get(
  '/',
  requirePermission(PERMISSION.TEAM_VIEW),
  validate(employeeListQuerySchema, 'query'),
  controller.listHandler
)

employeesRouter.get(
  '/:id',
  requirePermission(PERMISSION.TEAM_VIEW),
  validate(idParamSchema, 'params'),
  controller.getHandler
)

employeesRouter.post(
  '/',
  requirePermission(PERMISSION.TEAM_MANAGE),
  validate(createEmployeeSchema),
  controller.createHandler
)

employeesRouter.patch(
  '/:id',
  requirePermission(PERMISSION.TEAM_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateEmployeeSchema),
  controller.updateHandler
)

/** Manual confirmation, for a studio whose mail is not wired up yet. */
employeesRouter.post(
  '/:id/verify-email',
  requirePermission(PERMISSION.TEAM_MANAGE),
  validate(idParamSchema, 'params'),
  controller.verifyEmailHandler
)

employeesRouter.delete(
  '/:id',
  requirePermission(PERMISSION.TEAM_MANAGE),
  validate(idParamSchema, 'params'),
  controller.deactivateHandler
)

// Archiving hides a row from the working set; deleting is the separate,
// confirmed action.
mountArchiveRoutes(employeesRouter, {
  model: 'employee',
  entityType: 'Employee',
  permission: PERMISSION.TEAM_MANAGE
})
