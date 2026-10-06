import { PERMISSION, type Permission } from '@astir/types'

export interface NavItem {
  /** Message key under shell.nav; also the stable id of a group. */
  key: string
  to?: string
  icon: string
  /** One permission, or several that must all be held. */
  permission?: Permission | Permission[]
  children?: NavItem[]
}

/**
 * Sidebar tree (spec 6). Each entry declares the permission it needs; the
 * layout filters against the session so an item a role cannot use is never
 * rendered rather than rendered-then-denied.
 *
 * A group carries no permission of its own: it is shown when any child is,
 * so a role with one page inside a section still gets a way to reach it.
 */
export const NAVIGATION: NavItem[] = [
  { key: 'dashboard', to: '/dashboard', icon: 'lucide:layout-dashboard', permission: PERMISSION.DASHBOARD_VIEW },
  // Who came to work and who did not. Top level rather than inside «Команда»:
  // the owner looks for it every morning and could not find it in the group.
  // Also where the owner and the administrator start (auth store homePath).
  { key: 'attendance', to: '/team/attendance', icon: 'lucide:user-check', permission: PERMISSION.ATTENDANCE_VIEW },
  // Everyone with tasks of their own gets them one click away; for the people
  // doing the work this is also where a session starts (auth store homePath).
  { key: 'myTasks', to: '/tasks/my', icon: 'lucide:list-todo', permission: PERMISSION.TASK_VIEW_OWN },
  { key: 'projects', to: '/projects', icon: 'lucide:folder-kanban', permission: PERMISSION.PROJECT_VIEW },
  {
    key: 'production',
    icon: 'lucide:clapperboard',
    children: [
      { key: 'episodes', to: '/episodes', icon: 'lucide:tv', permission: PERMISSION.PRODUCTION_VIEW },
      { key: 'scenes', to: '/scenes', icon: 'lucide:film', permission: PERMISSION.PRODUCTION_VIEW },
      { key: 'shots', to: '/shots', icon: 'lucide:camera', permission: PERMISSION.PRODUCTION_VIEW },
      { key: 'tasks', to: '/tasks', icon: 'lucide:list-checks', permission: PERMISSION.TASK_VIEW_OWN },
      { key: 'reviews', to: '/reviews', icon: 'lucide:eye', permission: PERMISSION.REVIEW_VIEW },
      { key: 'revisions', to: '/revisions', icon: 'lucide:rotate-ccw', permission: PERMISSION.REVISION_VIEW },
      { key: 'render', to: '/render', icon: 'lucide:server', permission: PERMISSION.RENDER_VIEW },
      { key: 'assets', to: '/assets', icon: 'lucide:box', permission: PERMISSION.ASSET_VIEW }
    ]
  },
  { key: 'calendar', to: '/calendar', icon: 'lucide:calendar', permission: PERMISSION.PRODUCTION_VIEW },
  {
    key: 'team',
    icon: 'lucide:users',
    children: [
      { key: 'employees', to: '/team/employees', icon: 'lucide:user', permission: PERMISSION.TEAM_VIEW },
      { key: 'departments', to: '/team/departments', icon: 'lucide:building-2', permission: PERMISSION.TEAM_VIEW },
      { key: 'workload', to: '/team/workload', icon: 'lucide:gauge', permission: PERMISSION.WORKLOAD_VIEW },
      { key: 'timesheets', to: '/timesheets', icon: 'lucide:clock', permission: PERMISSION.TIMESHEET_VIEW_OWN },
      { key: 'timeline', to: '/timeline', icon: 'lucide:chart-gantt', permission: PERMISSION.PRODUCTION_VIEW }
    ]
  },
  { key: 'clients', to: '/clients', icon: 'lucide:handshake', permission: PERMISSION.CLIENT_VIEW },
  {
    key: 'finance',
    icon: 'lucide:wallet',
    children: [
      { key: 'financeOverview', to: '/finance', icon: 'lucide:pie-chart', permission: PERMISSION.FINANCE_VIEW },
      { key: 'budgets', to: '/finance/budgets', icon: 'lucide:calculator', permission: PERMISSION.BUDGET_VIEW },
      { key: 'expenses', to: '/finance/expenses', icon: 'lucide:receipt', permission: PERMISSION.FINANCE_VIEW },
      { key: 'payments', to: '/finance/payments', icon: 'lucide:credit-card', permission: PERMISSION.FINANCE_VIEW },
      { key: 'invoices', to: '/finance/invoices', icon: 'lucide:file-text', permission: PERMISSION.FINANCE_VIEW },
      // Opened by the narrower own-entries right, so staff can see their own
      // advances and fines without seeing the studio's money.
      { key: 'payroll', to: '/finance/payroll', icon: 'lucide:hand-coins', permission: PERMISSION.PAYROLL_VIEW_OWN }
    ]
  },
  {
    key: 'reports',
    icon: 'lucide:bar-chart-3',
    children: [
      { key: 'reportProduction', to: '/reports/production', icon: 'lucide:clapperboard', permission: PERMISSION.REPORT_VIEW },
      // Money is a narrower permission than reporting, and a role that has one
      // without the other must not be offered a link into a 403.
      { key: 'reportFinance', to: '/reports/financial', icon: 'lucide:trending-up', permission: [PERMISSION.REPORT_VIEW, PERMISSION.FINANCE_VIEW] },
      { key: 'reportTime', to: '/reports/time', icon: 'lucide:clock', permission: PERMISSION.REPORT_VIEW },
      { key: 'reportClients', to: '/reports/clients', icon: 'lucide:handshake', permission: PERMISSION.REPORT_VIEW }
    ]
  },
  { key: 'documents', to: '/documents', icon: 'lucide:folder', permission: PERMISSION.DOCUMENT_VIEW },
  { key: 'activity', to: '/activity', icon: 'lucide:activity', permission: PERMISSION.ACTIVITY_VIEW },
  { key: 'settings', to: '/settings', icon: 'lucide:settings', permission: PERMISSION.SETTINGS_VIEW }
]

/**
 * Filter the tree down to what this session may actually open.
 *
 * Children are filtered too, and a group left with none is dropped: a child
 * can need a narrower permission than its group, and rendering that link would
 * offer a route the API answers with 403.
 */
export function useVisibleNavigation() {
  const auth = useAuthStore()
  const allowed = (item: NavItem) =>
    !item.permission || [item.permission].flat().every(permission => auth.can(permission))

  return computed(() =>
    NAVIGATION.filter(allowed)
      .map(item => (item.children ? { ...item, children: item.children.filter(allowed) } : item))
      .filter(item => !item.children || item.children.length > 0)
  )
}
