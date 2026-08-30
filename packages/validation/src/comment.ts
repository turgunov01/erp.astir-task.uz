import { z } from 'zod'
import { listQuerySchema, uuidSchema } from './common'

/** Entities that accept comments (spec 58). */
const ENTITY_TYPES = ['Task', 'Shot', 'Version', 'Review', 'Revision', 'Project', 'Asset'] as const

export const createCommentSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: uuidSchema,
  message: z.string().trim().min(1, 'Комментарий не может быть пустым').max(4000),
  /** Reply target; the thread is one level deep by design. */
  parentId: uuidSchema.optional().nullable()
})

export const updateCommentSchema = z.object({
  message: z.string().trim().min(1).max(4000)
})

export const commentListQuerySchema = listQuerySchema.extend({
  entityType: z.enum(ENTITY_TYPES),
  entityId: uuidSchema
})
