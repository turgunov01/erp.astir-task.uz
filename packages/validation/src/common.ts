import { z } from 'zod'

export const uuidSchema = z.string().uuid('Invalid identifier')

/** Shared list query for every paginated endpoint (spec 66). */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.string().trim().max(64).optional(),
  order: z.enum(['asc', 'desc']).default('desc')
})

export type ListQuery = z.infer<typeof listQuerySchema>

export const idParamSchema = z.object({ id: uuidSchema })

/** ISO date string that must parse to a real date. */
export const dateStringSchema = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')
