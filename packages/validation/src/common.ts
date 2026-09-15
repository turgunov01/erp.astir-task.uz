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

/**
 * A partial schema for updates, built from a create schema.
 *
 * `.partial()` alone is a trap with zod 4: a field declared with `.default()`
 * still receives its default when the key is absent, so a PATCH that sends
 * only `{ deadline }` would also reset `status`, `priority` or `currency` to
 * whatever a brand-new row gets. Defaults belong to creation; here every
 * field is simply optional.
 */
type StripDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T
type PartialShape<T extends z.ZodRawShape> = { [K in keyof T]: z.ZodOptional<StripDefault<T[K]>> }

export function partialUpdate<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<PartialShape<T>> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    const bare = field instanceof z.ZodDefault ? field.removeDefault() : field
    shape[key] = (bare as z.ZodTypeAny).optional()
  }
  return z.object(shape) as unknown as z.ZodObject<PartialShape<T>>
}
