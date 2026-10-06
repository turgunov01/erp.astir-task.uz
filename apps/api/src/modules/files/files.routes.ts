import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { idParamSchema, listQuerySchema, uuidSchema } from '@astir/validation'
import { DOCUMENT_TYPE, PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent, buildMeta, toSkipTake } from '../../lib/http'
import { badRequest, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { recordActivity } from '../../lib/activity'
import { bufferStream, isAllowedMimeType, MAX_SINGLE_REQUEST_BYTES, storage } from '../../lib/storage'
import { mountArchiveRoutes } from '../../lib/archive-routes'
import { createDocument, DOCUMENT_TYPES, OWNER_KEYS, type OwnerKey } from './files.service'

/*
 * Buffered in memory so the file is validated before anything touches disk.
 * Kept small for that reason: larger files go through the chunked upload API
 * (/api/uploads), which streams to disk instead.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SINGLE_REQUEST_BYTES, files: 1 }
})

const listSchema = listQuerySchema.extend({
  projectId: uuidSchema.optional(),
  clientId: uuidSchema.optional(),
  ...Object.fromEntries(OWNER_KEYS.map(key => [key, uuidSchema.optional()])),
  /** Only media, for the gallery view. */
  mediaOnly: z.coerce.boolean().optional(),
  type: z.enum(DOCUMENT_TYPES).optional()
})

export const filesRouter = Router()

filesRouter.use(authenticate)

filesRouter.get(
  '/',
  requirePermission(PERMISSION.DOCUMENT_VIEW),
  validate(listSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<z.infer<typeof listSchema>>(req)
      const { skip, take } = toSkipTake(query.page, query.limit)

      const where = {
        deletedAt: null,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...Object.fromEntries(
          OWNER_KEYS
            .map(key => [key, (query as Partial<Record<OwnerKey, string>>)[key]])
            .filter(([, value]) => Boolean(value))
        ),
        ...(query.mediaOnly
          ? { OR: [
            { mimeType: { startsWith: 'image/' } },
            { mimeType: { startsWith: 'video/' } },
            { mimeType: { startsWith: 'audio/' } }
          ] }
          : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' as const } }
          : {})
      }

      const [items, total] = await Promise.all([
        prisma.document.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: query.order },
          include: {
            uploadedBy: { select: { id: true, firstName: true, lastName: true } },
            // The library links straight back to the work the file belongs to.
            task: { select: { id: true, title: true, status: true } },
            project: { select: { id: true, code: true } }
          }
        }),
        prisma.document.count({ where })
      ])

      return sendList(res, items, buildMeta(total, query.page, query.limit))
    } catch (err) {
      next(err)
    }
  }
)

filesRouter.post(
  '/',
  requirePermission(PERMISSION.DOCUMENT_MANAGE),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const file = req.file
      if (!file) throw badRequest('No file received under field "file"')
      if (!isAllowedMimeType(file.mimetype)) {
        throw badRequest('File type ' + file.mimetype + ' is not allowed')
      }

      // Same path a completed chunked upload takes (modules/uploads).
      const document = await createDocument({
        fields: req.body ?? {},
        file: {
          stream: bufferStream(file.buffer),
          originalName: file.originalname,
          mimeType: file.mimetype
        },
        actorId: req.user?.id
      })

      return sendItem(res, document, 201)
    } catch (err) {
      next(err)
    }
  }
)

/** Renaming or reclassifying an upload; the blob itself never changes. */
const updateDocumentSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  type: z.enum(DOCUMENT_TYPE).optional(),
  projectId: uuidSchema.optional().nullable(),
  clientId: uuidSchema.optional().nullable()
})

filesRouter.patch(
  '/:id',
  requirePermission(PERMISSION.DOCUMENT_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateDocumentSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const existing = await prisma.document.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw notFound('Document')

      const document = await prisma.document.update({
        where: { id },
        data: req.body,
        include: {
          project: { select: { id: true, code: true } },
          task: { select: { id: true, title: true } },
          uploadedBy: { select: { id: true, firstName: true, lastName: true } }
        }
      })

      await recordActivity({
        actorId: req.user?.id,
        entityType: 'Document',
        entityId: id,
        action: 'updated',
        projectId: document.projectId ?? undefined
      })

      return sendItem(res, document)
    } catch (err) {
      next(err)
    }
  }
)

filesRouter.delete(
  '/:id',
  requirePermission(PERMISSION.DOCUMENT_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const document = await prisma.document.findFirst({
        where: { id, deletedAt: null }
      })
      if (!document) throw notFound('Document')

      // Soft delete the row, then drop the blob; the row is the source of truth.
      await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } })
      if (document.fileUrl.startsWith('/uploads/')) {
        await storage.remove(document.fileUrl.replace('/uploads/', ''))
      }

      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

// Archiving hides a row from the working set; deleting is the separate,
// confirmed action.
mountArchiveRoutes(filesRouter, {
  model: 'document',
  entityType: 'Document',
  permission: PERMISSION.DOCUMENT_MANAGE
})
