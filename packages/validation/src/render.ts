import { z } from 'zod'
import { listQuerySchema, uuidSchema } from './common'

const RENDER_STATUS = ['QUEUED', 'RENDERING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const
const PRIORITY = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

export const createRenderJobSchema = z.object({
  projectId: uuidSchema,
  shotId: uuidSchema.optional().nullable(),
  versionId: uuidSchema.optional().nullable(),
  startFrame: z.coerce.number().int().min(0).optional().nullable(),
  endFrame: z.coerce.number().int().min(0).optional().nullable(),
  priority: z.enum(PRIORITY).default('NORMAL')
})

export const updateRenderJobSchema = z.object({
  status: z.enum(RENDER_STATUS).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  priority: z.enum(PRIORITY).optional(),
  nodeId: uuidSchema.optional().nullable(),
  errorMessage: z.string().trim().max(2000).optional().nullable()
})

export const renderListQuerySchema = listQuerySchema.extend({
  status: z.enum(RENDER_STATUS).optional(),
  projectId: uuidSchema.optional(),
  shotId: uuidSchema.optional()
})
