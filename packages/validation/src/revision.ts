import { z } from 'zod'
import { listQuerySchema, uuidSchema } from './common'

const REVISION_STATUS = ['OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'COMPLETED', 'CANCELLED'] as const
const PRIORITY = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

const optionalDate = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')
  .optional()
  .nullable()

export const createRevisionSchema = z.object({
  projectId: uuidSchema,
  shotId: uuidSchema.optional().nullable(),
  taskId: uuidSchema.optional().nullable(),
  versionId: uuidSchema.optional().nullable(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  assignedToId: uuidSchema.optional().nullable(),
  priority: z.enum(PRIORITY).default('NORMAL'),
  deadline: optionalDate
})

export const updateRevisionSchema = createRevisionSchema
  .partial()
  .omit({ projectId: true })
  .extend({ status: z.enum(REVISION_STATUS).optional() })

export const revisionListQuerySchema = listQuerySchema.extend({
  status: z.enum(REVISION_STATUS).optional(),
  projectId: uuidSchema.optional(),
  shotId: uuidSchema.optional(),
  assignedToId: uuidSchema.optional(),
  mine: z.coerce.boolean().optional()
})
