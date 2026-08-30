import { z } from 'zod'
import { listQuerySchema } from './common'

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  description: z.string().trim().max(1000).optional().nullable()
})
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>

export const updateDepartmentSchema = createDepartmentSchema.partial()

export const departmentListQuerySchema = listQuerySchema
