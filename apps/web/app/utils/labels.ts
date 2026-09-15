/**
 * Russian labels for the enums the API returns.
 *
 * The database stores English enum members; every surface that shows one to a
 * user reads it from here, so a wording change lands in one place.
 */

export const ASSET_TYPE_LABEL: Record<string, string> = {
  CHARACTER: 'Персонаж', ENVIRONMENT: 'Окружение', PROP: 'Пропс',
  MODEL: 'Модель', RIG: 'Риг', TEXTURE: 'Текстура', ANIMATION: 'Анимация',
  AUDIO: 'Звук', REFERENCE: 'Референс', TEMPLATE: 'Шаблон', OTHER: 'Прочее'
}

export const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Низкий', NORMAL: 'Обычный', HIGH: 'Высокий', URGENT: 'Срочный'
}

export const REVISION_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Открыта',
  IN_PROGRESS: 'В работе',
  READY_FOR_REVIEW: 'На проверке',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена'
}

export const RENDER_STATUS_LABEL: Record<string, string> = {
  QUEUED: 'В очереди',
  RENDERING: 'Рендерится',
  COMPLETED: 'Готово',
  FAILED: 'Ошибка',
  CANCELLED: 'Отменено'
}

export const PRODUCTION_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Не начато',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  REVISION: 'На правках',
  APPROVED: 'Утверждено',
  COMPLETED: 'Завершено',
  ON_HOLD: 'Приостановлено'
}

/** Full date and time, for detail panels where precision matters. */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

/** Day-level date, for table cells and deadlines. */
export function formatDay(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

/**
 * Money with its own currency.
 *
 * Records keep the kopecks by default; roll-ups pass 0, because a portfolio
 * total to the kopeck is false precision nobody reads.
 */
export function formatMoney(
  value: number | null | undefined,
  currency = 'USD',
  maximumFractionDigits = 2
) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency, maximumFractionDigits
  }).format(value)
}

export function fullName(
  person: { firstName: string, lastName: string } | null | undefined
) {
  return person ? person.firstName + ' ' + person.lastName : '—'
}

export const CLIENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Активен', INACTIVE: 'Неактивен', ARCHIVED: 'В архиве'
}

export const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Владелец', ADMIN: 'Администратор', PRODUCER: 'Продюсер',
  PROJECT_MANAGER: 'Менеджер проекта', ART_DIRECTOR: 'Арт-директор',
  ARTIST: 'Художник', CLIENT: 'Клиент', FINANCE: 'Финансы'
}

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: 'Полная занятость', PART_TIME: 'Частичная занятость',
  FREELANCE: 'Фриланс', INTERN: 'Стажировка'
}

export const EMPLOYEE_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Работает', ON_LEAVE: 'В отпуске', INACTIVE: 'Не работает'
}

export const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  CONTRACT: 'Договор', BRIEF: 'Бриф', SPECIFICATION: 'Спецификация',
  INVOICE: 'Счёт', ACT: 'Акт', NDA: 'NDA', OTHER: 'Прочее'
}

export const REVIEW_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Ожидает',
  IN_REVIEW: 'На обсуждении',
  CHANGES_REQUESTED: 'Нужны правки',
  APPROVED: 'Согласовано',
  REJECTED: 'Отклонено',
  // Deadline passed with nobody deciding: the discussion window closed.
  EXPIRED: 'Вопрос закрыт'
}

export const REVIEW_TYPE_LABEL: Record<string, string> = {
  INTERNAL: 'Внутреннее',
  ART_DIRECTOR: 'Арт-директор',
  CLIENT: 'Клиентское',
  FINAL: 'Финальное'
}

/** Turn a label map into select options, preserving declaration order. */
export function enumOptions(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => ({ value, label }))
}

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Черновик',
  PLANNING: 'Планирование',
  PRE_PRODUCTION: 'Препродакшен',
  PRODUCTION: 'Продакшен',
  POST_PRODUCTION: 'Постпродакшен',
  CLIENT_REVIEW: 'У клиента',
  DELIVERY: 'Сдача',
  COMPLETED: 'Завершён',
  ON_HOLD: 'Приостановлен',
  CANCELLED: 'Отменён',
  ARCHIVED: 'В архиве'
}

export const PROJECT_TYPE_LABEL: Record<string, string> = {
  '2D_ANIMATION': '2D-анимация',
  '3D_ANIMATION': '3D-анимация',
  MOTION_DESIGN: 'Моушн-дизайн',
  COMMERCIAL: 'Реклама',
  SHORT_FILM: 'Короткий метр',
  SERIES: 'Сериал',
  FEATURE_FILM: 'Полный метр',
  OTHER: 'Прочее'
}

export const TASK_STATUS_LABEL: Record<string, string> = {
  BACKLOG: 'Бэклог',
  READY: 'Готова к работе',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  REVISION: 'На правках',
  APPROVED: 'Утверждена',
  DONE: 'Завершена',
  BLOCKED: 'Заблокирована'
}

/** Fallback for an enum value with no translation yet. */
export function enumLabel(map: Record<string, string>, value: string) {
  return map[value] ?? value.split('_').join(' ')
}

/**
 * One lookup for status badges, which do not know which enum they were given.
 *
 * The enums overlap (`APPROVED`, `COMPLETED`, `IN_PROGRESS` appear in several)
 * but the overlapping members mean the same thing, so a merged map is safe.
 * More specific maps come last and win.
 */
export const STATUS_LABEL: Record<string, string> = {
  ...PRODUCTION_STATUS_LABEL,
  ...TASK_STATUS_LABEL,
  ...REVISION_STATUS_LABEL,
  ...RENDER_STATUS_LABEL,
  ...REVIEW_STATUS_LABEL,
  ...PROJECT_STATUS_LABEL,
  ...CLIENT_STATUS_LABEL,
  ...EMPLOYEE_STATUS_LABEL,
  // Version statuses, which have no map of their own.
  WORKING: 'В работе',
  SUBMITTED: 'Отправлена'
}

export const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  EMPLOYEE: 'Штат',
  FREELANCER: 'Подряд',
  RENDER: 'Рендер',
  SOFTWARE: 'Софт',
  HARDWARE: 'Железо',
  AUDIO: 'Звук',
  PRODUCTION: 'Продакшн',
  OTHER: 'Прочее'
}

/*
 * Kept out of STATUS_LABEL on purpose: PENDING already means "Ожидает" for a
 * review, and merging this map would silently retitle every review badge.
 * StatusBadge reaches it through kind="payment" instead.
 */
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Ожидает оплаты',
  PARTIALLY_PAID: 'Оплачен частично',
  PAID: 'Оплачен',
  OVERDUE: 'Просрочен',
  CANCELLED: 'Отменён'
}

export const RISK_LABEL: Record<string, string> = {
  LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий', CRITICAL: 'Критический'
}

/**
 * What each recorded action says in the interface.
 *
 * The log stores machine names like task.status_changed. Splitting those on
 * dots and underscores produces readable English, which is the wrong language
 * for every other string in this application, so the feed reads from a real
 * dictionary and falls back to the machine name only for actions nobody has
 * translated yet.
 */
export const ACTIVITY_ACTION_LABEL: Record<string, string> = {
  created: 'создано',
  updated: 'изменено',
  deleted: 'удалено',

  'project.created': 'создал проект',
  'project.status_changed': 'сменил статус проекта',
  'project.archived': 'архивировал проект',
  'project.hard_deleted': 'удалил проект без возврата',
  'member.added': 'добавил участника в проект',
  'member.removed': 'убрал участника из проекта',

  'stage.created': 'создал этап',
  'stage.status_changed': 'сменил статус этапа',
  'episode.created': 'создал эпизод',
  'episode.status_changed': 'сменил статус эпизода',
  'scene.created': 'создал сцену',
  'scene.status_changed': 'сменил статус сцены',
  'shot.created': 'создал шот',
  'shot.status_changed': 'сменил статус шота',
  'shot_stage.status_changed': 'сменил статус этапа шота',

  'task.created': 'создал задачу',
  'task.assigned': 'назначил исполнителя',
  'task.status_changed': 'сменил статус задачи',
  'task.archived': 'архивировал задачу',
  'task.unarchived': 'вернул задачу из архива',
  'task.deleted': 'удалил задачу',

  'version.created': 'загрузил версию',
  'version.submitted': 'отправил версию на согласование',
  'version.deleted': 'удалил версию',
  'revision.created': 'завёл правку',
  'revision.status_changed': 'сменил статус правки',
  'revision.deleted': 'удалил правку',
  'render.queued': 'поставил задачу в очередь рендера',
  'asset.created': 'добавил ассет',
  'file.uploaded': 'загрузил файл',
  'review.approved': 'утвердил версию',
  'review.changes_requested': 'запросил правки по версии',
  'review.rejected': 'отклонил версию',

  'finance.budget_saved': 'сохранил бюджет проекта',
  'finance.budget_deleted': 'удалил бюджет проекта',
  'finance.expense_created': 'добавил расход',
  'finance.expense_updated': 'изменил расход',
  'finance.expense_deleted': 'удалил расход',
  'finance.invoice_created': 'выставил счёт',
  'finance.invoice_updated': 'изменил счёт',
  'finance.invoice_deleted': 'удалил счёт',
  'finance.payment_created': 'провёл платёж',
  'finance.payment_updated': 'изменил платёж',
  'finance.payment_deleted': 'удалил платёж',

  'settings.updated': 'изменил настройки студии',
  'settings.template_created': 'создал шаблон пайплайна',
  'settings.template_updated': 'изменил шаблон пайплайна',
  'settings.template_deleted': 'удалил шаблон пайплайна',
  'settings.mail_tested': 'проверил почтовые настройки',

  'client.created': 'создал клиента',
  'client.updated': 'изменил клиента',
  'client.archived': 'архивировал клиента',
  'department.created': 'создал отдел',
  'department.updated': 'изменил отдел',
  'department.deleted': 'удалил отдел',
  'employee.updated': 'изменил сотрудника',
  'employee.email_verified_manually': 'подтвердил почту сотрудника вручную',
  'user.created': 'завёл пользователя',
  'user.role_changed': 'сменил роль пользователя',
  'user.deactivated': 'отключил пользователя'
}

/** Entity names as they read in a sentence about them. */
export const ENTITY_TYPE_LABEL: Record<string, string> = {
  Project: 'Проект',
  ProjectStage: 'Этап',
  ProjectMember: 'Участник',
  Episode: 'Эпизод',
  Scene: 'Сцена',
  Shot: 'Шот',
  ShotStage: 'Этап шота',
  Task: 'Задача',
  Version: 'Версия',
  Review: 'Согласование',
  Revision: 'Правка',
  RenderJob: 'Рендер',
  Asset: 'Ассет',
  Document: 'Документ',
  Client: 'Клиент',
  Department: 'Отдел',
  Employee: 'Сотрудник',
  User: 'Пользователь',
  ProjectBudget: 'Бюджет',
  Expense: 'Расход',
  Invoice: 'Счёт',
  Payment: 'Платёж',
  StudioSettings: 'Настройки студии',
  PipelineTemplate: 'Шаблон пайплайна'
}

/**
 * Rough age of an event, for feeds where the exact minute does not matter.
 *
 * Deliberately coarse: past a day nobody counts hours, and a feed full of
 * precise timestamps is harder to skim than one that says "3 дн назад".
 */
export function timeAgo(value: string | Date | null | undefined) {
  if (!value) return '—'
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return minutes + ' мин назад'
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours + ' ч назад'
  return Math.round(hours / 24) + ' дн назад'
}

/**
 * The permission catalogue as the role editor shows it: grouped by the section
 * of the app it unlocks, in sidebar order, with the page-opening right first
 * in each group so the "who sees this page" question reads off the top row.
 */
export interface PermissionGroup {
  label: string
  permissions: ReadonlyArray<{ key: string, label: string }>
}

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  { label: 'Панель управления', permissions: [
    { key: 'dashboard:view', label: 'Открывать панель' }
  ] },
  { label: 'Проекты', permissions: [
    { key: 'project:view', label: 'Видеть проекты' },
    { key: 'project:create', label: 'Создавать' },
    { key: 'project:update', label: 'Редактировать' },
    { key: 'project:archive', label: 'Архивировать' },
    { key: 'project:delete', label: 'Удалять' }
  ] },
  { label: 'Производство: эпизоды, сцены, шоты, календарь', permissions: [
    { key: 'production:view', label: 'Видеть' },
    { key: 'production:manage', label: 'Управлять' },
    { key: 'pipeline:manage', label: 'Настраивать конвейер' }
  ] },
  { label: 'Задачи', permissions: [
    { key: 'task:view:own', label: 'Видеть свои задачи (открывает раздел)' },
    { key: 'task:view', label: 'Видеть все задачи' },
    { key: 'task:create', label: 'Создавать' },
    { key: 'task:update', label: 'Изменять' },
    { key: 'task:assign', label: 'Назначать исполнителей' }
  ] },
  { label: 'Версии', permissions: [
    { key: 'version:view', label: 'Видеть' },
    { key: 'version:upload', label: 'Загружать' },
    { key: 'version:delete:approved', label: 'Удалять утверждённые' }
  ] },
  { label: 'Согласование', permissions: [
    { key: 'review:view', label: 'Видеть' },
    { key: 'review:internal', label: 'Внутреннее ревью' },
    { key: 'review:client', label: 'Клиентское ревью' },
    { key: 'review:approve', label: 'Утверждать' }
  ] },
  { label: 'Правки', permissions: [
    { key: 'revision:view', label: 'Видеть' },
    { key: 'revision:manage', label: 'Управлять' }
  ] },
  { label: 'Библиотека ассетов', permissions: [
    { key: 'asset:view', label: 'Видеть' },
    { key: 'asset:manage', label: 'Управлять' }
  ] },
  { label: 'Очередь рендера', permissions: [
    { key: 'render:view', label: 'Видеть' },
    { key: 'render:manage', label: 'Управлять' }
  ] },
  { label: 'Команда', permissions: [
    { key: 'team:view', label: 'Видеть сотрудников и отделы' },
    { key: 'team:manage', label: 'Управлять сотрудниками' },
    { key: 'workload:view', label: 'Видеть загрузку' }
  ] },
  { label: 'Учёт времени', permissions: [
    { key: 'timesheet:view:own', label: 'Видеть свой табель (открывает раздел)' },
    { key: 'timesheet:view:all', label: 'Видеть табели всех' },
    { key: 'timesheet:submit', label: 'Заполнять табель' }
  ] },
  { label: 'Клиенты', permissions: [
    { key: 'client:view', label: 'Видеть' },
    { key: 'client:manage', label: 'Управлять' }
  ] },
  { label: 'Финансы', permissions: [
    { key: 'finance:view', label: 'Видеть финансы' },
    { key: 'finance:manage', label: 'Управлять' },
    { key: 'budget:view', label: 'Видеть бюджеты' }
  ] },
  { label: 'Отчёты', permissions: [
    { key: 'report:view', label: 'Видеть отчёты' }
  ] },
  { label: 'Документы', permissions: [
    { key: 'document:view', label: 'Видеть' },
    { key: 'document:manage', label: 'Управлять' }
  ] },
  { label: 'Лента событий и аудит', permissions: [
    { key: 'activity:view', label: 'Видеть ленту' },
    { key: 'audit:view', label: 'Видеть журнал аудита' }
  ] },
  { label: 'Настройки', permissions: [
    { key: 'settings:view', label: 'Открывать настройки' },
    { key: 'settings:manage', label: 'Менять настройки' },
    { key: 'user:manage', label: 'Управлять пользователями' },
    { key: 'permission:manage', label: 'Редактировать права ролей' }
  ] }
]
