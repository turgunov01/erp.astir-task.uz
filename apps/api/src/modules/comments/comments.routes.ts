import { Router } from 'express'
import {
  commentListQuerySchema,
  createCommentSchema,
  idParamSchema,
  updateCommentSchema
} from '@astir/validation'
import { authenticate } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { unauthenticated } from '../../lib/errors'
import * as service from './comments.service'

export const commentsRouter = Router()

commentsRouter.use(authenticate)

/**
 * Comments follow the entity, not a permission of their own: anyone who can
 * open the record can discuss it (spec 58).
 */
commentsRouter.get(
  '/',
  validate(commentListQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { entityType, entityId } = validatedQuery<{ entityType: string, entityId: string }>(req)
      const items = await service.list(entityType, entityId)
      return sendList(res, items, {
        page: 1, limit: items.length, total: items.length, pages: 1
      })
    } catch (err) {
      next(err)
    }
  }
)

commentsRouter.post('/', validate(createCommentSchema), async (req, res, next) => {
  try {
    if (!req.user) throw unauthenticated()
    return sendItem(res, await service.create(req.body, req.user.id), 201)
  } catch (err) {
    next(err)
  }
})

commentsRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateCommentSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthenticated()
      const comment = await service.update(req.params.id as string, req.body.message, req.user.id)
      return sendItem(res, comment)
    } catch (err) {
      next(err)
    }
  }
)

commentsRouter.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthenticated()
      await service.remove(req.params.id as string, req.user.id, req.user.role)
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)
