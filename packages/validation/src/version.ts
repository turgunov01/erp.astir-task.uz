import { z } from 'zod'
import { listQuerySchema, uuidSchema } from './common'

const VERSION_STATUS = [
  'WORKING', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED',
  'APPROVED', 'REJECTED', 'SUPERSEDED'
] as const

const REVIEW_TYPE = ['INTERNAL', 'ART_DIRECTOR', 'CLIENT', 'FINAL'] as const

/**
 * Version metadata. The binary arrives as multipart on the same request, so
 * this validates only the fields that travel as form values.
 */
export const createVersionSchema = z.object({
  projectId: uuidSchema,
  shotId: uuidSchema.optional().nullable(),
  taskId: uuidSchema.optional().nullable(),
  assetId: uuidSchema.optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  label: z.string().trim().max(80).optional()
})

export const versionListQuerySchema = listQuerySchema.extend({
  status: z.enum(VERSION_STATUS).optional(),
  projectId: uuidSchema.optional(),
  shotId: uuidSchema.optional(),
  taskId: uuidSchema.optional(),
  assetId: uuidSchema.optional()
})

/** Submitting opens a review of the chosen type (spec 19 to 21). */
export const submitVersionSchema = z.object({
  reviewType: z.enum(REVIEW_TYPE).default('INTERNAL'),
  reviewerId: uuidSchema.optional().nullable(),
  comment: z.string().trim().max(2000).optional().nullable()
})
