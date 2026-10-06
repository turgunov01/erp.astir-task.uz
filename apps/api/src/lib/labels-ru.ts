/**
 * Russian names for the enum members the API writes into files people open
 * (CSV exports). The web app has its own copy in apps/web/app/utils/labels.ts;
 * these are kept word-for-word the same so an export reads like the screen.
 */

export const PAYMENT_METHOD_RU: Record<string, string> = {
  BANK_TRANSFER: 'Перечисление', CASH: 'Наличные', CARD: 'Карта', OTHER: 'Другое'
}

export const PAYMENT_STATUS_RU: Record<string, string> = {
  PENDING: 'Ожидает оплаты', PARTIALLY_PAID: 'Оплачен частично', PAID: 'Оплачен',
  OVERDUE: 'Просрочен', CANCELLED: 'Отменён'
}

export const EXPENSE_CATEGORY_RU: Record<string, string> = {
  EMPLOYEE: 'Штат', FREELANCER: 'Подряд', RENDER: 'Рендер', SOFTWARE: 'Софт',
  HARDWARE: 'Железо', AUDIO: 'Звук', PRODUCTION: 'Продакшн', OFFICE: 'Аренда и офис',
  TAXES: 'Налоги и сборы', MARKETING: 'Маркетинг', OTHER: 'Прочее'
}

export const PROJECT_STATUS_RU: Record<string, string> = {
  DRAFT: 'Черновик', PLANNING: 'Планирование', PRE_PRODUCTION: 'Препродакшен',
  PRODUCTION: 'Продакшен', POST_PRODUCTION: 'Постпродакшен', CLIENT_REVIEW: 'У клиента',
  DELIVERY: 'Сдача', COMPLETED: 'Завершён', ON_HOLD: 'Приостановлен',
  CANCELLED: 'Отменён', ARCHIVED: 'В архиве'
}

export const RISK_RU: Record<string, string> = {
  LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий', CRITICAL: 'Критический'
}

export const CLIENT_STATUS_RU: Record<string, string> = {
  ACTIVE: 'Активен', INACTIVE: 'Неактивен', ARCHIVED: 'В архиве'
}

export const TASK_STATUS_RU: Record<string, string> = {
  BACKLOG: 'Бэклог', READY: 'Готова к работе', IN_PROGRESS: 'В работе', REVIEW: 'На проверке',
  REVISION: 'На правках', APPROVED: 'Утверждена', DONE: 'Завершена', BLOCKED: 'Заблокирована'
}

/** «В работе» → «На проверке», as a status move reads in comments and letters. */
export function taskStatusChangeRu(from: string, to: string) {
  return '«' + labelRu(TASK_STATUS_RU, from) + '» → «' + labelRu(TASK_STATUS_RU, to) + '»'
}

/** Never the raw English member: an unknown value reads as «Не указано». */
export function labelRu(map: Record<string, string>, value: string | null | undefined) {
  if (!value) return ''
  return map[value] ?? 'Не указано'
}
