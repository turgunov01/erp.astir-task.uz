import { Router } from 'express'
import { z } from 'zod'
import { idParamSchema, updateStageSchema, uuidSchema } from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { validatedQuery } from '../../middleware/validate'
import * as service from './stages.service'

const listQuerySchema = z.object({ projectId: uuidSchema })

const createStageSchema = z.object({
  projectId: uuidSchema,
  name: z.string().trim().min(2).max(80),
  weight: z.coerce.number().int().min(1).max(10).optional(),
  departmentId: uuidSchema.optional().nullable()
})

export const stagesRouter = Router()

stagesRouter.use(authenticate)

stagesRouter.get(
  '/',
  requirePermission(PERMISSION.PRODUCTION_VIEW),
  validate(listQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { projectId } = validatedQuery<{ projectId: string }>(req)
      const stages = await service.listByProject(projectId)
      return sendList(res, stages, {
        page: 1, limit: stages.length, total: stages.length, pages: 1
      })
    } catch (err) {
      next(err)
    }
  }
)

stagesRouter.patch(
  '/:id',
  // Project-level pipeline stages belong to production, not to the artist
  // working a shot: an artist moves their own ShotStage instead, via
  // PATCH /api/shots/:id/stages/:stageId.
  requirePermission(PERMISSION.PRODUCTION_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateStageSchema),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.update(req.params.id as string, req.body, req.user?.id))
    } catch (err) {
      next(err)
    }
  }
)

stagesRouter.post(
  '/',
  requirePermission(PERMISSION.PIPELINE_MANAGE),
  validate(createStageSchema),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.create(req.body, req.user?.id), 201)
    } catch (err) {
      next(err)
    }
  }
)

stagesRouter.delete(
  '/:id',
  requirePermission(PERMISSION.PIPELINE_MANAGE),
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
