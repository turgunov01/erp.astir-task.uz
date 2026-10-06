import { z } from 'zod'
import { uuidSchema } from './common'
import { createVersionSchema } from './version'

const DOCUMENT_TYPES = [
  'CONTRACT', 'BRIEF', 'SPECIFICATION', 'INVOICE', 'ACT', 'NDA', 'OTHER'
] as const

/** 1 GB; mirrors UPLOAD_LIMITS.MAX_FILE_BYTES in @astir/types. */
const MAX_FILE_BYTES = 1024 * 1024 * 1024

/**
 * Where a document is filed: a project, a client, or any one record that
 * accepts attachments. The same fields the multipart endpoint reads.
 */
export const documentUploadFieldsSchema = z.object({
  projectId: uuidSchema.optional().nullable(),
  clientId: uuidSchema.optional().nullable(),
  taskId: uuidSchema.optional().nullable(),
  reviewId: uuidSchema.optional().nullable(),
  assetId: uuidSchema.optional().nullable(),
  renderJobId: uuidSchema.optional().nullable(),
  episodeId: uuidSchema.optional().nullable(),
  sceneId: uuidSchema.optional().nullable(),
  shotId: uuidSchema.optional().nullable(),
  revisionId: uuidSchema.optional().nullable(),
  departmentId: uuidSchema.optional().nullable(),
  employeeId: uuidSchema.optional().nullable(),
  type: z.enum(DOCUMENT_TYPES).optional(),
  name: z.string().trim().max(200).optional()
})

const fileShape = {
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(200),
  size: z.number().int().min(1).max(MAX_FILE_BYTES, 'i18n:common.validation.fileOver1Gb')
}

/**
 * Opening a chunked upload: the file's description plus the metadata of the
 * record it becomes once every chunk has arrived.
 */
export const createUploadSessionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('document'),
    ...fileShape,
    fields: documentUploadFieldsSchema.default({})
  }),
  z.object({
    kind: z.literal('version'),
    ...fileShape,
    fields: createVersionSchema
  })
])

export type CreateUploadSessionInput = z.infer<typeof createUploadSessionSchema>
export type DocumentUploadFields = z.infer<typeof documentUploadFieldsSchema>

export const uploadChunkParamsSchema = z.object({
  id: uuidSchema,
  index: z.coerce.number().int().min(0)
})
