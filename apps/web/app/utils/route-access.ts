import { PERMISSION, type Permission } from '@astir/types'

/**
 * Route to permission map (spec 78).
 *
 * Hiding a sidebar entry is presentation, not access control: without this a
 * user could still reach the URL directly. Longest matching prefix wins.
 */
const ROUTE_PERMISSIONS: ReadonlyArray<[string, Permission]> = [
  ['/dashboard', PERMISSION.DASHBOARD_VIEW],
  ['/projects', PERMISSION.PROJECT_VIEW],
  ['/episodes', PERMISSION.PRODUCTION_VIEW],
  ['/scenes', PERMISSION.PRODUCTION_VIEW],
  ['/shots', PERMISSION.PRODUCTION_VIEW],
  ['/tasks', PERMISSION.TASK_VIEW_OWN],
  ['/reviews', PERMISSION.REVIEW_VIEW],
  ['/revisions', PERMISSION.REVISION_VIEW],
  ['/render', PERMISSION.RENDER_VIEW],
  ['/assets', PERMISSION.ASSET_VIEW],
  ['/calendar', PERMISSION.PRODUCTION_VIEW],
  ['/team', PERMISSION.TEAM_VIEW],
  ['/team/workload', PERMISSION.WORKLOAD_VIEW],
  ['/team/attendance', PERMISSION.ATTENDANCE_VIEW],
  ['/timeline', PERMISSION.PRODUCTION_VIEW],
  ['/timesheets', PERMISSION.TIMESHEET_VIEW_OWN],
  ['/clients', PERMISSION.CLIENT_VIEW],
  ['/finance', PERMISSION.FINANCE_VIEW],
  ['/finance/budgets', PERMISSION.BUDGET_VIEW],
  ['/finance/payroll', PERMISSION.PAYROLL_VIEW_OWN],
  ['/reports', PERMISSION.REPORT_VIEW],
  ['/documents', PERMISSION.DOCUMENT_VIEW],
  ['/activity', PERMISSION.ACTIVITY_VIEW],
  ['/settings', PERMISSION.SETTINGS_VIEW]
]

export function requiredPermission(pathname: string): Permission | null {
  let match: [string, Permission] | null = null
  for (const entry of ROUTE_PERMISSIONS) {
    const prefix = entry[0]
    const matches = pathname === prefix || pathname.startsWith(prefix + '/')
    if (matches && (!match || prefix.length > match[0].length)) match = entry
  }
  return match ? match[1] : null
}

/**
 * Whether a signed-in user may open a link.
 *
 * The same check the route middleware makes, for the links a page draws
 * itself (dashboard tiles, «see all» links): a link a role cannot follow
 * must not be offered, rather than lead into an access error.
 */
export function canOpenPath(path: string, can: (permission: Permission) => boolean): boolean {
  const pathname = path.split(/[?#]/)[0] ?? path
  const permission = requiredPermission(pathname)
  return !permission || can(permission)
}
