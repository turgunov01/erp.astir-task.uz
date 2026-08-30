import { z } from 'zod'
import { listQuerySchema, uuidSchema } from './common'

const EMPLOYMENT_TYPE = ['FULL_TIME', 'PART_TIME', 'FREELANCE', 'INTERN'] as const
const EMPLOYEE_STATUS = ['ACTIVE', 'ON_LEAVE', 'INACTIVE'] as const
const ROLE = [
  'OWNER', 'ADMIN', 'PRODUCER', 'PROJECT_MANAGER',
  'ART_DIRECTOR', 'ARTIST', 'CLIENT', 'FINANCE'
] as const

/** Creating an employee also provisions the login it belongs to. */
export const createEmployeeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(ROLE).default('ARTIST'),

  departmentId: uuidSchema.optional().nullable(),
  position: z.string().trim().min(2).max(120),
  employmentType: z.enum(EMPLOYMENT_TYPE).default('FULL_TIME'),
  hourlyRate: z.coerce.number().min(0).max(100000).optional().nullable(),
  weeklyCapacityHours: z.coerce.number().int().min(1).max(80).default(40),
  status: z.enum(EMPLOYEE_STATUS).default('ACTIVE')
})
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>

export const updateEmployeeSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  role: z.enum(ROLE).optional(),
  departmentId: uuidSchema.optional().nullable(),
  position: z.string().trim().min(2).max(120).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPE).optional(),
  hourlyRate: z.coerce.number().min(0).max(100000).optional().nullable(),
  weeklyCapacityHours: z.coerce.number().int().min(1).max(80).optional(),
  status: z.enum(EMPLOYEE_STATUS).optional(),
  isActive: z.boolean().optional()
})

export const employeeListQuerySchema = listQuerySchema.extend({
  departmentId: uuidSchema.optional(),
  status: z.enum(EMPLOYEE_STATUS).optional(),
  role: z.enum(ROLE).optional()
})
