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

export const RISK_LABEL: Record<string, string> = {
  LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий', CRITICAL: 'Критический'
}
