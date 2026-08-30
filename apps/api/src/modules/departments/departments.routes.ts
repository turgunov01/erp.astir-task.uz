import { Router } from 'express'
import {
  createDepartmentSchema,
  departmentListQuerySchema,
  idParamSchema,
  updateDepartmentSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import * as controller from './departments.controller'
import { mountArchiveRoutes } from '../../lib/archive-routes'

export const departmentsRouter = Router()

departmentsRouter.use(authenticate)

departmentsRouter.get(
  '/',
  requirePermission(PERMISSION.TEAM_VIEW),
  validate(departmentListQuerySchema, 'query'),
  controller.listHandler
)

departmentsRouter.get(
  '/:id',
  requirePermission(PERMISSION.TEAM_VIEW),
  validate(idParamSchema, 'params'),
  controller.getHandler
)

departmentsRouter.post(
  '/',
  requirePermission(PERMISSION.TEAM_MANAGE),
  validate(createDepartmentSchema),
  controller.createHandler
)

departmentsRouter.patch(
  '/:id',
  requirePermission(PERMISSION.TEAM_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateDepartmentSchema),
  controller.updateHandler
)

departmentsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.TEAM_MANAGE),
  validate(idParamSchema, 'params'),
  controller.removeHandler
)

// Archiving hides a row from the working set; deleting is the separate,
// confirmed action.
mountArchiveRoutes(departmentsRouter, {
  model: 'department',
  entityType: 'Department',
  permission: PERMISSION.TEAM_MANAGE
})
