import { PERMISSION, type Permission } from '@astir/types'

export interface NavItem {
  label: string
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
  { label: 'Панель управления', to: '/dashboard', icon: 'lucide:layout-dashboard', permission: PERMISSION.DASHBOARD_VIEW },
  { label: 'Проекты', to: '/projects', icon: 'lucide:folder-kanban', permission: PERMISSION.PROJECT_VIEW },
  {
    label: 'Производство',
    icon: 'lucide:clapperboard',
    children: [
      { label: 'Эпизоды', to: '/episodes', icon: 'lucide:tv', permission: PERMISSION.PRODUCTION_VIEW },
      { label: 'Сцены', to: '/scenes', icon: 'lucide:film', permission: PERMISSION.PRODUCTION_VIEW },
      { label: 'Шоты', to: '/shots', icon: 'lucide:camera', permission: PERMISSION.PRODUCTION_VIEW },
      { label: 'Задачи', to: '/tasks', icon: 'lucide:list-checks', permission: PERMISSION.TASK_VIEW_OWN },
      { label: 'Согласование', to: '/reviews', icon: 'lucide:eye', permission: PERMISSION.REVIEW_VIEW },
      { label: 'Правки', to: '/revisions', icon: 'lucide:rotate-ccw', permission: PERMISSION.REVISION_VIEW },
      { label: 'Очередь рендера', to: '/render', icon: 'lucide:server', permission: PERMISSION.RENDER_VIEW },
      { label: 'Библиотека ассетов', to: '/assets', icon: 'lucide:box', permission: PERMISSION.ASSET_VIEW }
    ]
  },
  { label: 'Календарь', to: '/calendar', icon: 'lucide:calendar', permission: PERMISSION.PRODUCTION_VIEW },
  {
    label: 'Команда',
    icon: 'lucide:users',
    children: [
      { label: 'Сотрудники', to: '/team/employees', icon: 'lucide:user', permission: PERMISSION.TEAM_VIEW },
      { label: 'Отделы', to: '/team/departments', icon: 'lucide:building-2', permission: PERMISSION.TEAM_VIEW },
      { label: 'Загрузка', to: '/team/workload', icon: 'lucide:gauge', permission: PERMISSION.WORKLOAD_VIEW },
      { label: 'Учёт времени', to: '/timesheets', icon: 'lucide:clock', permission: PERMISSION.TIMESHEET_VIEW_OWN },
      { label: 'Таймлайн', to: '/timeline', icon: 'lucide:chart-gantt', permission: PERMISSION.PRODUCTION_VIEW }
    ]
  },
  { label: 'Клиенты', to: '/clients', icon: 'lucide:handshake', permission: PERMISSION.CLIENT_VIEW },
  {
    label: 'Финансы',
    icon: 'lucide:wallet',
    children: [
      { label: 'Обзор', to: '/finance', icon: 'lucide:pie-chart', permission: PERMISSION.FINANCE_VIEW },
      { label: 'Бюджеты', to: '/finance/budgets', icon: 'lucide:calculator', permission: PERMISSION.BUDGET_VIEW },
      { label: 'Расходы', to: '/finance/expenses', icon: 'lucide:receipt', permission: PERMISSION.FINANCE_VIEW },
      { label: 'Платежи', to: '/finance/payments', icon: 'lucide:credit-card', permission: PERMISSION.FINANCE_VIEW },
      { label: 'Счета', to: '/finance/invoices', icon: 'lucide:file-text', permission: PERMISSION.FINANCE_VIEW }
    ]
  },
  {
    label: 'Отчёты',
    icon: 'lucide:bar-chart-3',
    children: [
      { label: 'Производство', to: '/reports/production', icon: 'lucide:clapperboard', permission: PERMISSION.REPORT_VIEW },
      // Money is a narrower permission than reporting, and a role that has one
      // without the other must not be offered a link into a 403.
      { label: 'Финансы', to: '/reports/financial', icon: 'lucide:trending-up', permission: [PERMISSION.REPORT_VIEW, PERMISSION.FINANCE_VIEW] },
      { label: 'Время и люди', to: '/reports/time', icon: 'lucide:clock', permission: PERMISSION.REPORT_VIEW },
      { label: 'Клиенты', to: '/reports/clients', icon: 'lucide:handshake', permission: PERMISSION.REPORT_VIEW }
    ]
  },
  { label: 'Документы', to: '/documents', icon: 'lucide:folder', permission: PERMISSION.DOCUMENT_VIEW },
  { label: 'Лента событий', to: '/activity', icon: 'lucide:activity', permission: PERMISSION.ACTIVITY_VIEW },
  { label: 'Настройки', to: '/settings', icon: 'lucide:settings', permission: PERMISSION.SETTINGS_VIEW }
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
