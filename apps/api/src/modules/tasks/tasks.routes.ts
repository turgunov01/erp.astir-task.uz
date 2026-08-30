import { Router } from 'express'
import { z } from 'zod'
import {
  addDependencySchema,
  changeTaskStatusSchema,
  createTaskSchema,
  idParamSchema,
  taskListQuerySchema,
  updateTaskSchema,
  uuidSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import * as service from './tasks.service'
import { overdueSummary } from '../../lib/overdue'

const dependencyParamSchema = z.object({ id: uuidSchema, dependsOnTaskId: uuidSchema })

export const tasksRouter = Router()

tasksRouter.use(authenticate)

tasksRouter.get(
  '/',
  requirePermission(PERMISSION.TASK_VIEW_OWN),
  validate(taskListQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<Record<string, unknown>>(req)
      // `mine=true` is a shorthand the UI uses for the "My tasks" views.
      if (query.mine) query.assigneeId = req.user?.id
      const result = await service.list(query as never)
      return sendList(res, result.items, result.meta)
    } catch (err) {
      next(err)
    }
  }
)

tasksRouter.get(
  '/board-counts',
  requirePermission(PERMISSION.TASK_VIEW_OWN),
  validate(z.object({ projectId: uuidSchema }), 'query'),
  async (req, res, next) => {
    try {
      const { projectId } = validatedQuery<{ projectId: string }>(req)
      return sendItem(res, await service.boardCounts(projectId))
    } catch (err) {
      next(err)
    }
  }
)

/** Studio-wide overdue list, the view administration works from. */
tasksRouter.get(
  '/overdue',
  requirePermission(PERMISSION.TASK_VIEW),
  async (_req, res, next) => {
    try {
      const tasks = await overdueSummary()
      return sendList(res, tasks, {
        page: 1, limit: tasks.length, total: tasks.length, pages: 1
      })
    } catch (err) {
      next(err)
    }
  }
)

tasksRouter.get(
  '/:id',
  requirePermission(PERMISSION.TASK_VIEW_OWN),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.getById(req.params.id as string))
    } catch (err) {
      next(err)
    }
  }
)

tasksRouter.post(
  '/',
  requirePermission(PERMISSION.TASK_CREATE),
  validate(createTaskSchema),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.create(req.body, req.user?.id), 201)
    } catch (err) {
      next(err)
    }
  }
)

tasksRouter.patch(
  '/:id',
  requirePermission(PERMISSION.TASK_UPDATE),
  validate(idParamSchema, 'params'),
  validate(updateTaskSchema),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.update(req.params.id as string, req.body, req.user?.id))
    } catch (err) {
      next(err)
    }
  }
)

tasksRouter.post(
  '/:id/status',
  requirePermission(PERMISSION.TASK_UPDATE),
  validate(idParamSchema, 'params'),
  validate(changeTaskStatusSchema),
  async (req, res, next) => {
    try {
      const task = await service.changeStatus(
        req.params.id as string,
        req.body.status,
        req.body.overrideDependencies,
        req.user?.id,
        req.body.overdueReason,
        { comment: req.body.comment, documentId: req.body.documentId }
      )
      return sendItem(res, task)
    } catch (err) {
      next(err)
    }
  }
)

tasksRouter.post(
  '/:id/dependencies',
  requirePermission(PERMISSION.TASK_ASSIGN),
  validate(idParamSchema, 'params'),
  validate(addDependencySchema),
  async (req, res, next) => {
    try {
      const task = await service.addDependency(req.params.id as string, req.body.dependsOnTaskId)
      return sendItem(res, task)
    } catch (err) {
      next(err)
    }
  }
)

tasksRouter.delete(
  '/:id/dependencies/:dependsOnTaskId',
  requirePermission(PERMISSION.TASK_ASSIGN),
  validate(dependencyParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const task = await service.removeDependency(
        req.params.id as string,
        req.params.dependsOnTaskId as string
      )
      return sendItem(res, task)
    } catch (err) {
      next(err)
    }
  }
)

tasksRouter.delete(
  '/:id',
  requirePermission(PERMISSION.TASK_CREATE),
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

// Archiving is a workflow action, so it needs only the update permission —
// unlike deletion, which stays with whoever may create tasks.
tasksRouter.post(
  '/:id/archive',
  requirePermission(PERMISSION.TASK_UPDATE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.archive(req.params.id as string, req.user?.id))
    } catch (err) {
      next(err)
    }
  }
)

tasksRouter.post(
  '/:id/unarchive',
  requirePermission(PERMISSION.TASK_UPDATE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.unarchive(req.params.id as string, req.user?.id))
    } catch (err) {
      next(err)
    }
  }
)
