/**
 * Single source of truth for every domain enum.
 *
 * Values are byte-identical to the Prisma enums in apps/api/prisma/schema.prisma.
 * UI must import from here rather than inlining status strings (spec 99).
 */

export const ROLE = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  PRODUCER: 'PRODUCER',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  ART_DIRECTOR: 'ART_DIRECTOR',
  ARTIST: 'ARTIST',
  CLIENT: 'CLIENT',
  FINANCE: 'FINANCE'
} as const
export type Role = (typeof ROLE)[keyof typeof ROLE]

export const PROJECT_TYPE = {
  ANIMATION_2D: '2D_ANIMATION',
  ANIMATION_3D: '3D_ANIMATION',
  MOTION_DESIGN: 'MOTION_DESIGN',
  COMMERCIAL: 'COMMERCIAL',
  SHORT_FILM: 'SHORT_FILM',
  SERIES: 'SERIES',
  FEATURE_FILM: 'FEATURE_FILM',
  OTHER: 'OTHER'
} as const
export type ProjectType = (typeof PROJECT_TYPE)[keyof typeof PROJECT_TYPE]

export const PROJECT_STATUS = {
  DRAFT: 'DRAFT',
  PLANNING: 'PLANNING',
  PRE_PRODUCTION: 'PRE_PRODUCTION',
  PRODUCTION: 'PRODUCTION',
  POST_PRODUCTION: 'POST_PRODUCTION',
  CLIENT_REVIEW: 'CLIENT_REVIEW',
  DELIVERY: 'DELIVERY',
  COMPLETED: 'COMPLETED',
  ON_HOLD: 'ON_HOLD',
  CANCELLED: 'CANCELLED',
  ARCHIVED: 'ARCHIVED'
} as const
export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS]

export const PRIORITY = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT'
} as const
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY]

export const RISK_LEVEL = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
} as const
export type RiskLevel = (typeof RISK_LEVEL)[keyof typeof RISK_LEVEL]

/** Pipeline stage state, shared by ProjectStage and ShotStage (spec 11, 15). */
export const STAGE_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  READY: 'READY',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE'
} as const
export type StageStatus = (typeof STAGE_STATUS)[keyof typeof STAGE_STATUS]

export const TASK_STATUS = {
  BACKLOG: 'BACKLOG',
  READY: 'READY',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  REVISION: 'REVISION',
  APPROVED: 'APPROVED',
  DONE: 'DONE',
  BLOCKED: 'BLOCKED'
} as const
export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS]

/** Column order for the kanban board (spec 17). BLOCKED is a flag, not a column. */
export const TASK_BOARD_COLUMNS = [
  TASK_STATUS.BACKLOG,
  TASK_STATUS.READY,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.REVIEW,
  TASK_STATUS.REVISION,
  TASK_STATUS.APPROVED,
  TASK_STATUS.DONE
] as const

/** Applies to Episode, Scene and Shot. */
export const PRODUCTION_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  REVISION: 'REVISION',
  APPROVED: 'APPROVED',
  COMPLETED: 'COMPLETED',
  ON_HOLD: 'ON_HOLD'
} as const
export type ProductionStatus = (typeof PRODUCTION_STATUS)[keyof typeof PRODUCTION_STATUS]

export const VERSION_STATUS = {
  WORKING: 'WORKING',
  SUBMITTED: 'SUBMITTED',
  IN_REVIEW: 'IN_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED'
} as const
export type VersionStatus = (typeof VERSION_STATUS)[keyof typeof VERSION_STATUS]

export const REVIEW_TYPE = {
  INTERNAL: 'INTERNAL',
  ART_DIRECTOR: 'ART_DIRECTOR',
  CLIENT: 'CLIENT',
  FINAL: 'FINAL'
} as const
export type ReviewType = (typeof REVIEW_TYPE)[keyof typeof REVIEW_TYPE]

export const REVIEW_STATUS = {
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
} as const
export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS]

export const REVISION_STATUS = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  READY_FOR_REVIEW: 'READY_FOR_REVIEW',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
} as const
export type RevisionStatus = (typeof REVISION_STATUS)[keyof typeof REVISION_STATUS]

export const ASSET_TYPE = {
  CHARACTER: 'CHARACTER',
  ENVIRONMENT: 'ENVIRONMENT',
  PROP: 'PROP',
  MODEL: 'MODEL',
  RIG: 'RIG',
  TEXTURE: 'TEXTURE',
  ANIMATION: 'ANIMATION',
  AUDIO: 'AUDIO',
  REFERENCE: 'REFERENCE',
  TEMPLATE: 'TEMPLATE',
  OTHER: 'OTHER'
} as const
export type AssetType = (typeof ASSET_TYPE)[keyof typeof ASSET_TYPE]

export const RENDER_STATUS = {
  QUEUED: 'QUEUED',
  RENDERING: 'RENDERING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
} as const
export type RenderStatus = (typeof RENDER_STATUS)[keyof typeof RENDER_STATUS]

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED'
} as const
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS]

export const EXPENSE_CATEGORY = {
  EMPLOYEE: 'EMPLOYEE',
  FREELANCER: 'FREELANCER',
  RENDER: 'RENDER',
  SOFTWARE: 'SOFTWARE',
  HARDWARE: 'HARDWARE',
  AUDIO: 'AUDIO',
  PRODUCTION: 'PRODUCTION',
  OTHER: 'OTHER'
} as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORY)[keyof typeof EXPENSE_CATEGORY]

export const EMPLOYMENT_TYPE = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  FREELANCE: 'FREELANCE',
  INTERN: 'INTERN'
} as const
export type EmploymentType = (typeof EMPLOYMENT_TYPE)[keyof typeof EMPLOYMENT_TYPE]

export const EMPLOYEE_STATUS = {
  ACTIVE: 'ACTIVE',
  ON_LEAVE: 'ON_LEAVE',
  INACTIVE: 'INACTIVE'
} as const
export type EmployeeStatus = (typeof EMPLOYEE_STATUS)[keyof typeof EMPLOYEE_STATUS]

export const CLIENT_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED'
} as const
export type ClientStatus = (typeof CLIENT_STATUS)[keyof typeof CLIENT_STATUS]

export const DOCUMENT_TYPE = {
  CONTRACT: 'CONTRACT',
  BRIEF: 'BRIEF',
  SPECIFICATION: 'SPECIFICATION',
  INVOICE: 'INVOICE',
  ACT: 'ACT',
  NDA: 'NDA',
  OTHER: 'OTHER'
} as const
export type DocumentType = (typeof DOCUMENT_TYPE)[keyof typeof DOCUMENT_TYPE]

export const NOTIFICATION_TYPE = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_OVERDUE: 'TASK_OVERDUE',
  TASK_REVIEW: 'TASK_REVIEW',
  VERSION_SUBMITTED: 'VERSION_SUBMITTED',
  VERSION_APPROVED: 'VERSION_APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REVISION_CREATED: 'REVISION_CREATED',
  PROJECT_DEADLINE: 'PROJECT_DEADLINE',
  SHOT_DEADLINE: 'SHOT_DEADLINE',
  RENDER_FAILED: 'RENDER_FAILED',
  COMMENT_MENTION: 'COMMENT_MENTION'
} as const
export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE]

export const NOTIFICATION_CHANNEL = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
  TELEGRAM: 'TELEGRAM'
} as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL]
