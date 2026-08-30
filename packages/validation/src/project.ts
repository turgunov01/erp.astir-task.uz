import { z } from 'zod'
import { listQuerySchema, uuidSchema } from './common'

const PROJECT_TYPE = [
  '2D_ANIMATION', '3D_ANIMATION', 'MOTION_DESIGN', 'COMMERCIAL',
  'SHORT_FILM', 'SERIES', 'FEATURE_FILM', 'OTHER'
] as const

const PROJECT_STATUS = [
  'DRAFT', 'PLANNING', 'PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION',
  'CLIENT_REVIEW', 'DELIVERY', 'COMPLETED', 'ON_HOLD', 'CANCELLED', 'ARCHIVED'
] as const

const PRIORITY = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

const optionalDate = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')
  .optional()
  .nullable()

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
    // Left blank the service derives the next AST-nnn code.
    code: z.string().trim().regex(/^[A-Z0-9-]{3,20}$/, 'Use uppercase letters, digits and dashes').optional(),
    description: z.string().trim().max(4000).optional().nullable(),

    clientId: uuidSchema,
    projectManagerId: uuidSchema.optional().nullable(),
    producerId: uuidSchema.optional().nullable(),

    projectType: z.enum(PROJECT_TYPE).default('OTHER'),
    status: z.enum(PROJECT_STATUS).default('DRAFT'),
    priority: z.enum(PRIORITY).default('NORMAL'),

    startDate: optionalDate,
    deadline: optionalDate,

    budget: z.coerce.number().min(0).max(1000000000).optional().nullable(),
    currency: z.string().trim().length(3).toUpperCase().default('USD'),

    /** Name from PROJECT_TEMPLATES; seeds the pipeline on creation (spec 84). */
    template: z.string().trim().max(60).optional()
  })
  .refine(
    data =>
      !data.startDate ||
      !data.deadline ||
      Date.parse(data.startDate) <= Date.parse(data.deadline),
    { message: 'Deadline must be on or after the start date', path: ['deadline'] }
  )

export type CreateProjectInput = z.infer<typeof createProjectSchema>

export const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  clientId: uuidSchema.optional(),
  projectManagerId: uuidSchema.optional().nullable(),
  producerId: uuidSchema.optional().nullable(),
  projectType: z.enum(PROJECT_TYPE).optional(),
  status: z.enum(PROJECT_STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  startDate: optionalDate,
  deadline: optionalDate,
  budget: z.coerce.number().min(0).max(1000000000).optional().nullable(),
  currency: z.string().trim().length(3).toUpperCase().optional()
})

export const projectListQuerySchema = listQuerySchema.extend({
  status: z.enum(PROJECT_STATUS).optional(),
  projectType: z.enum(PROJECT_TYPE).optional(),
  clientId: uuidSchema.optional(),
  projectManagerId: uuidSchema.optional(),
  priority: z.enum(PRIORITY).optional()
})

// ---------------------------------------------------------------- members

/**
 * Project roster entry (spec 9, "Team" tab).
 *
 * `roleLabel` is free text on purpose: it describes what the person does on
 * this project ("Lead Animator", "FX"), which is finer-grained than the RBAC
 * role that governs their permissions.
 */
export const addProjectMemberSchema = z.object({
  userId: uuidSchema,
  roleLabel: z.string().trim().max(80).optional().nullable()
})
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>

export const updateProjectMemberSchema = z.object({
  roleLabel: z.string().trim().max(80).optional().nullable()
})

export const memberParamSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema
})
