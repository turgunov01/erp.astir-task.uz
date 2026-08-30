import { z } from 'zod'
import { listQuerySchema } from './common'

const CLIENT_STATUS = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const

export const createClientSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(160),
  companyName: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  status: z.enum(CLIENT_STATUS).default('ACTIVE'),
  notes: z.string().trim().max(4000).optional().nullable()
})
export type CreateClientInput = z.infer<typeof createClientSchema>

export const updateClientSchema = createClientSchema.partial()
export type UpdateClientInput = z.infer<typeof updateClientSchema>

export const clientListQuerySchema = listQuerySchema.extend({
  status: z.enum(CLIENT_STATUS).optional()
})

export const createClientContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  position: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  isPrimary: z.boolean().default(false)
})
