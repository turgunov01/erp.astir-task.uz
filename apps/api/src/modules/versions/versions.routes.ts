import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import {
  idParamSchema,
  submitVersionSchema,
  uuidSchema,
  versionListQuerySchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { badRequest } from '../../lib/errors'
import { isAllowedMimeType, MAX_UPLOAD_BYTES } from '../../lib/storage'
import * as service from './versions.service'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }
})

export const versionsRouter = Router()

versionsRouter.use(authenticate)

versionsRouter.get(
  '/',
  requirePermission(PERMISSION.VERSION_VIEW),
  validate(versionListQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const result = await service.list(validatedQuery<never>(req))
      return sendList(res, result.items, result.meta)
    } catch (err) {
      next(err)
    }
  }
)

/** Latest / submitted / approved for one target, never conflated (spec 20). */
versionsRouter.get(
  '/latest',
  requirePermission(PERMISSION.VERSION_VIEW),
  validate(
    z.object({
      shotId: uuidSchema.optional(),
      taskId: uuidSchema.optional(),
      assetId: uuidSchema.optional()
    }),
    'query'
  ),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.latestFor(validatedQuery<never>(req)))
    } catch (err) {
      next(err)
    }
  }
)

versionsRouter.get(
  '/:id',
  requirePermission(PERMISSION.VERSION_VIEW),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.getById(req.params.id as string))
    } catch (err) {
      next(err)
    }
  }
)

// Multipart: metadata travels as form fields alongside the binary.
versionsRouter.post(
  '/',
  requirePermission(PERMISSION.VERSION_UPLOAD),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.body.projectId) throw badRequest('projectId обязателен')
      if (req.file && !isAllowedMimeType(req.file.mimetype)) {
        throw badRequest('Тип файла ' + req.file.mimetype + ' не разрешён')
      }

      const version = await service.create(
        {
          projectId: req.body.projectId,
          shotId: req.body.shotId || null,
          taskId: req.body.taskId || null,
          assetId: req.body.assetId || null,
          notes: req.body.notes || null,
          label: req.body.label || undefined,
          file: req.file
        },
        req.user?.id
      )
      return sendItem(res, version, 201)
    } catch (err) {
      next(err)
    }
  }
)

versionsRouter.post(
  '/:id/submit',
  requirePermission(PERMISSION.VERSION_UPLOAD),
  validate(idParamSchema, 'params'),
  validate(submitVersionSchema),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.submit(req.params.id as string, req.body, req.user?.id))
    } catch (err) {
      next(err)
    }
  }
)

versionsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.VERSION_VIEW),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      await service.remove(req.params.id as string, req.user?.role, req.user?.id)
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)
