import { z } from 'zod'

/** Mirrors NotificationType in the Prisma schema. */
const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'TASK_OVERDUE',
  'TASK_REVIEW',
  'VERSION_SUBMITTED',
  'VERSION_APPROVED',
  'CHANGES_REQUESTED',
  'REVISION_CREATED',
  'PROJECT_DEADLINE',
  'SHOT_DEADLINE',
  'RENDER_FAILED',
  'COMMENT_MENTION',
  'PROJECT_ASSIGNED'
] as const

/** The channels a person can switch themselves; Telegram has no adapter yet. */
const CONFIGURABLE_CHANNELS = ['IN_APP', 'EMAIL'] as const

export const notificationPreferenceSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  channel: z.enum(CONFIGURABLE_CHANNELS),
  enabled: z.boolean()
})

/**
 * Saving preferences sends only the switches that changed; anything left out
 * keeps its stored value (or the default, which is on).
 */
export const updateNotificationPreferencesSchema = z.object({
  preferences: z
    .array(notificationPreferenceSchema)
    .min(1, 'Нет изменений для сохранения')
    .max(NOTIFICATION_TYPES.length * CONFIGURABLE_CHANNELS.length)
})

export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>
