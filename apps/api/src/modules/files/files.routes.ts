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
import { storage, isAllowedMimeType, MAX_UPLOAD_BYTES } from '../../lib/storage'
import { mountArchiveRoutes } from '../../lib/archive-routes'

const DOCUMENT_TYPES = [
  'CONTRACT', 'BRIEF', 'SPECIFICATION', 'INVOICE', 'ACT', 'NDA', 'OTHER'
] as const

// Buffered in memory so the file is validated before anything touches disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }
})

/**
 * Relations a document can hang from, and how to find the project it belongs
 * to.
 *
 * Every table in the app lets a file be attached to the record being created,
 * so the owner is looked up in this table rather than being another branch in
 * the upload handler for each new entity.
 */
/** The owning row, seen loosely: only the project link is read off it. */
type OwnerRow = Record<string, unknown> & {
  projectId?: string | null
  version?: { projectId: string } | null
}

interface OwnerSpec {
  /** Prisma delegate key. */
  model: string
  /** Project the document should also be filed under, when there is one. */
  project: (row: OwnerRow) => string | null
}

const OWNERS = {
  taskId: { model: 'task', project: row => row.projectId ?? null },
  reviewId: { model: 'review', project: row => row.version?.projectId ?? null },
  assetId: { model: 'asset', project: row => row.projectId ?? null },
  renderJobId: { model: 'renderJob', project: row => row.projectId ?? null },
  episodeId: { model: 'episode', project: row => row.projectId ?? null },
  sceneId: { model: 'scene', project: row => row.projectId ?? null },
  shotId: { model: 'shot', project: row => row.projectId ?? null },
  revisionId: { model: 'revision', project: row => row.projectId ?? null },
  departmentId: { model: 'department', project: () => null },
  employeeId: { model: 'employee', project: () => null }
} satisfies Record<string, OwnerSpec>

type OwnerKey = keyof typeof OWNERS

const OWNER_KEYS = Object.keys(OWNERS) as OwnerKey[]

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

      let projectId = req.body.projectId || null
      const clientId = req.body.clientId || null

      /*
       * Resolve whichever owner was sent.
       *
       * The owner is verified to exist before the blob is written, and the
       * document inherits its project so the upload also shows up in the
       * project file list without the caller passing both.
       */
      const owners: Partial<Record<OwnerKey, string>> = {}
      for (const key of OWNER_KEYS) {
        const value = req.body[key]
        if (!value) continue
        const spec: OwnerSpec = OWNERS[key]
        const delegate = (prisma as unknown as Record<string, {
          findFirst(args: unknown): Promise<OwnerRow | null>
        } | undefined>)[spec.model]
        if (!delegate) throw badRequest('Unknown attachment target: ' + key)
        const row = await delegate.findFirst({
          where: { id: value, deletedAt: null },
          include: key === 'reviewId' ? { version: { select: { projectId: true } } } : undefined
        })
        if (!row) throw notFound(spec.model)
        owners[key] = value
        projectId = projectId ?? spec.project(row)
      }

      if (!projectId && !clientId && Object.keys(owners).length === 0) {
        throw badRequest('Прикрепите файл к записи, проекту или клиенту')
      }

      if (projectId) {
        const project = await prisma.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: { id: true }
        })
        if (!project) throw notFound('Project')
      }

      const stored = await storage.save({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        prefix: projectId
          ? 'projects/' + projectId
          : clientId
            ? 'clients/' + clientId
            : 'shared'
      })

      const document = await prisma.document.create({
        data: {
          projectId,
          clientId,
          ...owners,
          type: DOCUMENT_TYPES.includes(req.body.type) ? req.body.type : 'OTHER',
          name: req.body.name?.trim() || file.originalname,
          fileUrl: stored.url,
          fileSize: BigInt(stored.size),
          mimeType: stored.mimeType,
          uploadedById: req.user?.id ?? null
        },
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          task: { select: { id: true, title: true, status: true } }
        }
      })

      await recordActivity({
        actorId: req.user?.id,
        entityType: 'Document',
        entityId: document.id,
        projectId,
        action: 'file.uploaded',
        metadata: { name: document.name, size: stored.size }
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
