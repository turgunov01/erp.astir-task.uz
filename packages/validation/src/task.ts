import { z } from 'zod'
import { listQuerySchema, uuidSchema } from './common'

const TASK_STATUS = [
  'BACKLOG', 'READY', 'IN_PROGRESS', 'REVIEW',
  'REVISION', 'APPROVED', 'DONE', 'BLOCKED'
] as const

const PRIORITY = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

const optionalDate = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')
  .optional()
  .nullable()

export const createTaskSchema = z.object({
  projectId: uuidSchema,
  episodeId: uuidSchema.optional().nullable(),
  sceneId: uuidSchema.optional().nullable(),
  shotId: uuidSchema.optional().nullable(),
  stageId: uuidSchema.optional().nullable(),

  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(200),
  description: z.string().trim().max(4000).optional().nullable(),

  status: z.enum(TASK_STATUS).default('BACKLOG'),
  priority: z.enum(PRIORITY).default('NORMAL'),

  assigneeId: uuidSchema.optional().nullable(),
  reviewerId: uuidSchema.optional().nullable(),

  estimatedHours: z.coerce.number().min(0).max(10000).optional().nullable(),
  startDate: optionalDate,
  deadline: optionalDate,

  /** Tasks that must reach a terminal state before this one may start (spec 18). */
  dependsOnTaskIds: z.array(uuidSchema).max(20).optional()
})
export type CreateTaskInput = z.infer<typeof createTaskSchema>

export const updateTaskSchema = createTaskSchema
  .partial()
  .omit({ projectId: true, dependsOnTaskIds: true })
  .extend({
    actualHours: z.coerce.number().min(0).max(10000).optional().nullable(),
    /**
     * Required when the task is past its deadline: administration is told
     * what changed and why, so a late task cannot be quietly reworked.
     */
    overdueReason: z.string().trim().min(3).max(500).optional()
  })

/**
 * Status transitions may be blocked by unfinished prerequisites, so the
 * override flag is explicit rather than implied by the caller's role.
 */
/**
 * Every status move must carry evidence: a written reason, an attached
 * file, or both. A board where cards move with no trace is the thing this
 * prevents.
 */
export const changeTaskStatusSchema = z.object({
  status: z.enum(TASK_STATUS),
  overrideDependencies: z.boolean().default(false),
  /** Required when moving a task that is already past its deadline. */
  overdueReason: z.string().trim().min(3).max(500).optional(),
  /** What was done or why the status changed; lands in the task thread. */
  comment: z.string().trim().max(4000).optional(),
  /** Id of a document already uploaded through /api/files. */
  documentId: uuidSchema.optional()
})
  .refine(
    data => (data.comment ?? '').trim().length >= 3 || Boolean(data.documentId),
    {
      message: 'Приложите файл или опишите, что сделано',
      path: ['comment']
    }
  )

export const taskListQuerySchema = listQuerySchema.extend({
  projectId: uuidSchema.optional(),
  shotId: uuidSchema.optional(),
  sceneId: uuidSchema.optional(),
  episodeId: uuidSchema.optional(),
  stageId: uuidSchema.optional(),
  status: z.enum(TASK_STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  assigneeId: uuidSchema.optional(),
  /** Shorthand for assigneeId = current user. */
  mine: z.coerce.boolean().optional(),
  overdue: z.coerce.boolean().optional(),
  /** Archived tasks are hidden unless explicitly asked for. */
  archived: z.coerce.boolean().optional()
})

export const addDependencySchema = z.object({
  dependsOnTaskId: uuidSchema
})
