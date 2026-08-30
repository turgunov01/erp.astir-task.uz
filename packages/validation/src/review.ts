import { z } from 'zod'
import { listQuerySchema, uuidSchema } from './common'

const REVIEW_TYPE = ['INTERNAL', 'ART_DIRECTOR', 'CLIENT', 'FINAL'] as const
const REVIEW_STATUS = ['PENDING', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'] as const

export const reviewListQuerySchema = listQuerySchema.extend({
  status: z.enum(REVIEW_STATUS).optional(),
  reviewType: z.enum(REVIEW_TYPE).optional(),
  projectId: uuidSchema.optional(),
  shotId: uuidSchema.optional(),
  /** Only reviews assigned to the caller. */
  mine: z.coerce.boolean().optional()
})

/**
 * A review decision (spec 22).
 *
 * Requesting changes must say what to change, so the comment is required for
 * that outcome and optional for the others.
 */
export const reviewDecisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']),
    comment: z.string().trim().max(4000).optional().nullable(),
    /** Deadline for the revision opened by a CHANGES_REQUESTED decision. */
    revisionDeadline: z
      .string()
      .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')
      .optional()
      .nullable()
  })
  .refine(
    data => data.decision !== 'CHANGES_REQUESTED' || Boolean(data.comment && data.comment.length > 0),
    { message: 'Опишите, что нужно исправить', path: ['comment'] }
  )
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>

export const createReviewSchema = z.object({
  versionId: uuidSchema,
  reviewType: z.enum(REVIEW_TYPE).default('INTERNAL'),
  reviewerId: uuidSchema.optional().nullable(),
  comment: z.string().trim().max(4000).optional().nullable()
})
