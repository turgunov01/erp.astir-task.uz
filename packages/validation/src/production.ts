import { z } from 'zod'
import { listQuerySchema, uuidSchema } from './common'

const PRODUCTION_STATUS = [
  'NOT_STARTED', 'IN_PROGRESS', 'REVIEW', 'REVISION',
  'APPROVED', 'COMPLETED', 'ON_HOLD'
] as const

const STAGE_STATUS = [
  'NOT_STARTED', 'READY', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE'
] as const

const optionalDate = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')
  .optional()
  .nullable()

// ---------------------------------------------------------------- episodes

export const createEpisodeSchema = z.object({
  projectId: uuidSchema,
  // Omitted means "next free number in this project" (see episodes.service).
  number: z.coerce.number().int().min(1).max(9999).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  /** Seconds. */
  duration: z.coerce.number().int().min(0).max(86400).optional().nullable(),
  status: z.enum(PRODUCTION_STATUS).default('NOT_STARTED'),
  startDate: optionalDate,
  deadline: optionalDate
})
export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>

export const updateEpisodeSchema = createEpisodeSchema.partial().omit({ projectId: true })

export const episodeListQuerySchema = listQuerySchema.extend({
  projectId: uuidSchema.optional(),
  status: z.enum(PRODUCTION_STATUS).optional()
})

// ---------------------------------------------------------------- scenes

export const createSceneSchema = z.object({
  projectId: uuidSchema,
  episodeId: uuidSchema.optional().nullable(),
  // Omitted means "next free number in this episode".
  sceneNumber: z.coerce.number().int().min(1).max(9999).optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  duration: z.coerce.number().int().min(0).max(86400).optional().nullable(),
  status: z.enum(PRODUCTION_STATUS).default('NOT_STARTED')
})
export type CreateSceneInput = z.infer<typeof createSceneSchema>

export const updateSceneSchema = createSceneSchema.partial().omit({ projectId: true })

export const sceneListQuerySchema = listQuerySchema.extend({
  projectId: uuidSchema.optional(),
  episodeId: uuidSchema.optional(),
  status: z.enum(PRODUCTION_STATUS).optional()
})

// ---------------------------------------------------------------- shots

export const createShotSchema = z.object({
  projectId: uuidSchema,
  episodeId: uuidSchema.optional().nullable(),
  sceneId: uuidSchema.optional().nullable(),
  shotNumber: z.coerce.number().int().min(1).max(9999).optional(),
  name: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
  duration: z.coerce.number().int().min(0).max(86400).optional().nullable(),
  fps: z.coerce.number().int().min(1).max(240).default(24),
  startFrame: z.coerce.number().int().min(0).optional().nullable(),
  endFrame: z.coerce.number().int().min(0).optional().nullable(),
  status: z.enum(PRODUCTION_STATUS).default('NOT_STARTED'),
  assigneeId: uuidSchema.optional().nullable(),
  deadline: optionalDate
})
export type CreateShotInput = z.infer<typeof createShotSchema>

export const updateShotSchema = createShotSchema.partial().omit({ projectId: true })

export const shotListQuerySchema = listQuerySchema.extend({
  projectId: uuidSchema.optional(),
  episodeId: uuidSchema.optional(),
  sceneId: uuidSchema.optional(),
  status: z.enum(PRODUCTION_STATUS).optional(),
  assigneeId: uuidSchema.optional()
})

// ---------------------------------------------------------------- stages

export const updateStageSchema = z.object({
  status: z.enum(STAGE_STATUS).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  assigneeId: uuidSchema.optional().nullable(),
  deadline: optionalDate,
  weight: z.coerce.number().int().min(1).max(10).optional()
})

export const updateShotStageSchema = z.object({
  status: z.enum(STAGE_STATUS).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  assigneeId: uuidSchema.optional().nullable(),
  deadline: optionalDate
})
