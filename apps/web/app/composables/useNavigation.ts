import { PERMISSION, type Permission } from '@astir/types'

export interface NavItem {
  label: string
  to?: string
  icon: string
  permission?: Permission
  children?: NavItem[]
}

/**
 * Sidebar tree (spec 6). Each entry declares the permission it needs; the
 * layout filters against the session so an item a role cannot use is never
 * rendered rather than rendered-then-denied.
 */
export const NAVIGATION: NavItem[] = [
  { label: 'Панель управления', to: '/dashboard', icon: 'lucide:layout-dashboard', permission: PERMISSION.DASHBOARD_VIEW },
  { label: 'Проекты', to: '/projects', icon: 'lucide:folder-kanban', permission: PERMISSION.PROJECT_VIEW },
  {
    label: 'Производство',
    icon: 'lucide:clapperboard',
    permission: PERMISSION.PRODUCTION_VIEW,
    children: [
      { label: 'Эпизоды', to: '/episodes', icon: 'lucide:tv' },
      { label: 'Сцены', to: '/scenes', icon: 'lucide:film' },
      { label: 'Шоты', to: '/shots', icon: 'lucide:camera' },
      { label: 'Задачи', to: '/tasks', icon: 'lucide:list-checks' },
      { label: 'Согласование', to: '/reviews', icon: 'lucide:eye' },
      { label: 'Правки', to: '/revisions', icon: 'lucide:rotate-ccw' },
      { label: 'Очередь рендера', to: '/render', icon: 'lucide:server' },
      { label: 'Библиотека ассетов', to: '/assets', icon: 'lucide:box' }
    ]
  },
  { label: 'Календарь', to: '/calendar', icon: 'lucide:calendar', permission: PERMISSION.PRODUCTION_VIEW },
  {
    label: 'Команда',
    icon: 'lucide:users',
    permission: PERMISSION.TEAM_VIEW,
    children: [
      { label: 'Сотрудники', to: '/team/employees', icon: 'lucide:user' },
      { label: 'Отделы', to: '/team/departments', icon: 'lucide:building-2' },
      { label: 'Загрузка', to: '/team/workload', icon: 'lucide:gauge' },
      { label: 'Учёт времени', to: '/timesheets', icon: 'lucide:clock' },
      { label: 'Таймлайн', to: '/timeline', icon: 'lucide:chart-gantt' }
    ]
  },
  { label: 'Клиенты', to: '/clients', icon: 'lucide:handshake', permission: PERMISSION.CLIENT_VIEW },
  {
    label: 'Финансы',
    icon: 'lucide:wallet',
    permission: PERMISSION.FINANCE_VIEW,
    children: [
      { label: 'Обзор', to: '/finance', icon: 'lucide:pie-chart' },
      { label: 'Бюджеты', to: '/finance/budgets', icon: 'lucide:calculator' },
      { label: 'Расходы', to: '/finance/expenses', icon: 'lucide:receipt' },
      { label: 'Платежи', to: '/finance/payments', icon: 'lucide:credit-card' },
      { label: 'Счета', to: '/finance/invoices', icon: 'lucide:file-text' }
    ]
  },
  { label: 'Отчёты', to: '/reports', icon: 'lucide:bar-chart-3', permission: PERMISSION.REPORT_VIEW },
  { label: 'Документы', to: '/documents', icon: 'lucide:folder', permission: PERMISSION.DOCUMENT_VIEW },
  { label: 'Лента событий', to: '/activity', icon: 'lucide:activity', permission: PERMISSION.ACTIVITY_VIEW },
  { label: 'Настройки', to: '/settings', icon: 'lucide:settings', permission: PERMISSION.SETTINGS_VIEW }
]

/** Filter the tree down to what this session may actually open. */
export function useVisibleNavigation() {
  const auth = useAuthStore()
  return computed(() =>
    NAVIGATION.filter(item => !item.permission || auth.can(item.permission))
  )
}
