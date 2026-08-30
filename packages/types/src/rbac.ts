import { ROLE, type Role } from './enums'

/**
 * Permission catalogue (spec 4).
 *
 * Format is `resource:action`. Both the API middleware and the sidebar
 * read from this one map, so a permission is never hardcoded twice (spec 99).
 */
export const PERMISSION = {
  DASHBOARD_VIEW: 'dashboard:view',

  PROJECT_VIEW: 'project:view',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_ARCHIVE: 'project:archive',

  CLIENT_VIEW: 'client:view',
  CLIENT_MANAGE: 'client:manage',

  PRODUCTION_VIEW: 'production:view',
  PRODUCTION_MANAGE: 'production:manage',
  PIPELINE_MANAGE: 'pipeline:manage',

  TASK_VIEW: 'task:view',
  TASK_VIEW_OWN: 'task:view:own',
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',
  TASK_ASSIGN: 'task:assign',

  VERSION_VIEW: 'version:view',
  VERSION_UPLOAD: 'version:upload',
  VERSION_DELETE_APPROVED: 'version:delete:approved',

  REVIEW_VIEW: 'review:view',
  REVIEW_INTERNAL: 'review:internal',
  REVIEW_CLIENT: 'review:client',
  REVIEW_APPROVE: 'review:approve',

  REVISION_VIEW: 'revision:view',
  REVISION_MANAGE: 'revision:manage',

  ASSET_VIEW: 'asset:view',
  ASSET_MANAGE: 'asset:manage',

  RENDER_VIEW: 'render:view',
  RENDER_MANAGE: 'render:manage',

  TEAM_VIEW: 'team:view',
  TEAM_MANAGE: 'team:manage',
  WORKLOAD_VIEW: 'workload:view',

  TIMESHEET_VIEW_OWN: 'timesheet:view:own',
  TIMESHEET_VIEW_ALL: 'timesheet:view:all',
  TIMESHEET_SUBMIT: 'timesheet:submit',

  FINANCE_VIEW: 'finance:view',
  FINANCE_MANAGE: 'finance:manage',
  BUDGET_VIEW: 'budget:view',

  REPORT_VIEW: 'report:view',
  DOCUMENT_VIEW: 'document:view',
  DOCUMENT_MANAGE: 'document:manage',

  ACTIVITY_VIEW: 'activity:view',
  AUDIT_VIEW: 'audit:view',

  SETTINGS_VIEW: 'settings:view',
  SETTINGS_MANAGE: 'settings:manage',
  USER_MANAGE: 'user:manage',
  PERMISSION_MANAGE: 'permission:manage'
} as const

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION]

const ALL_PERMISSIONS = Object.values(PERMISSION) as Permission[]

const P = PERMISSION

/**
 * Role to permission mapping.
 *
 * OWNER holds every permission by construction, so adding a new permission
 * can never silently lock the owner out.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  [ROLE.OWNER]: ALL_PERMISSIONS,

  [ROLE.ADMIN]: ALL_PERMISSIONS.filter(
    p => p !== P.PERMISSION_MANAGE && p !== P.PROJECT_DELETE
  ),

  [ROLE.PRODUCER]: [
    P.DASHBOARD_VIEW,
    P.PROJECT_VIEW, P.PROJECT_CREATE, P.PROJECT_UPDATE, P.PROJECT_ARCHIVE,
    P.CLIENT_VIEW,
    P.PRODUCTION_VIEW, P.PRODUCTION_MANAGE, P.PIPELINE_MANAGE,
    P.TASK_VIEW, P.TASK_CREATE, P.TASK_UPDATE, P.TASK_ASSIGN,
    P.VERSION_VIEW,
    P.REVIEW_VIEW, P.REVIEW_INTERNAL,
    P.REVISION_VIEW, P.REVISION_MANAGE,
    P.ASSET_VIEW,
    P.RENDER_VIEW, P.RENDER_MANAGE,
    P.TEAM_VIEW, P.WORKLOAD_VIEW,
    P.TIMESHEET_VIEW_ALL, P.TIMESHEET_VIEW_OWN, P.TIMESHEET_SUBMIT,
    P.BUDGET_VIEW,
    P.REPORT_VIEW, P.DOCUMENT_VIEW, P.ACTIVITY_VIEW
  ],

  [ROLE.PROJECT_MANAGER]: [
    P.DASHBOARD_VIEW,
    P.PROJECT_VIEW, P.PROJECT_UPDATE,
    P.CLIENT_VIEW,
    P.PRODUCTION_VIEW, P.PRODUCTION_MANAGE, P.PIPELINE_MANAGE,
    P.TASK_VIEW, P.TASK_CREATE, P.TASK_UPDATE, P.TASK_ASSIGN,
    P.VERSION_VIEW,
    P.REVIEW_VIEW, P.REVIEW_INTERNAL,
    P.REVISION_VIEW, P.REVISION_MANAGE,
    P.ASSET_VIEW, P.ASSET_MANAGE,
    P.RENDER_VIEW,
    P.TEAM_VIEW, P.WORKLOAD_VIEW,
    P.TIMESHEET_VIEW_ALL, P.TIMESHEET_VIEW_OWN, P.TIMESHEET_SUBMIT,
    P.REPORT_VIEW, P.DOCUMENT_VIEW, P.ACTIVITY_VIEW
  ],

  [ROLE.ART_DIRECTOR]: [
    P.DASHBOARD_VIEW,
    P.PROJECT_VIEW,
    P.PRODUCTION_VIEW,
    P.TASK_VIEW,
    P.VERSION_VIEW,
    P.REVIEW_VIEW, P.REVIEW_INTERNAL, P.REVIEW_APPROVE,
    P.REVISION_VIEW, P.REVISION_MANAGE,
    P.ASSET_VIEW, P.ASSET_MANAGE,
    P.TEAM_VIEW,
    P.TIMESHEET_VIEW_OWN, P.TIMESHEET_SUBMIT,
    P.ACTIVITY_VIEW
  ],

  [ROLE.ARTIST]: [
    P.DASHBOARD_VIEW,
    P.PROJECT_VIEW,
    P.PRODUCTION_VIEW,
    P.TASK_VIEW_OWN, P.TASK_UPDATE,
    P.VERSION_VIEW, P.VERSION_UPLOAD,
    P.REVIEW_VIEW,
    P.REVISION_VIEW,
    P.ASSET_VIEW,
    P.TIMESHEET_VIEW_OWN, P.TIMESHEET_SUBMIT
  ],

  [ROLE.CLIENT]: [
    P.PROJECT_VIEW,
    P.VERSION_VIEW,
    P.REVIEW_VIEW, P.REVIEW_CLIENT,
    P.REVISION_VIEW,
    P.DOCUMENT_VIEW
  ],

  [ROLE.FINANCE]: [
    P.DASHBOARD_VIEW,
    P.PROJECT_VIEW,
    P.CLIENT_VIEW,
    P.FINANCE_VIEW, P.FINANCE_MANAGE, P.BUDGET_VIEW,
    P.REPORT_VIEW,
    P.DOCUMENT_VIEW, P.DOCUMENT_MANAGE,
    P.TIMESHEET_VIEW_ALL,
    P.ACTIVITY_VIEW
  ]
}

/** True when the role carries the permission. Used by API guards and the sidebar. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}
