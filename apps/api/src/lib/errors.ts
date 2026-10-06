import { ERROR_CODE, type ErrorCode } from '@astir/types'

/**
 * Typed application error. Every deliberate failure path throws one of these
 * so the error middleware can map it to the documented envelope (spec 67)
 * without guessing at status codes.
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode
  readonly details?: Record<string, string[]>

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: Record<string, string[]>
  ) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    Error.captureStackTrace?.(this, AppError)
  }
}

export const badRequest = (message: string, details?: Record<string, string[]>) =>
  new AppError(400, ERROR_CODE.VALIDATION_FAILED, message, details)

export const unauthenticated = (message = 'Нужно войти в систему') =>
  new AppError(401, ERROR_CODE.UNAUTHENTICATED, message)

export const invalidCredentials = (message = 'Неверная почта или пароль') =>
  new AppError(401, ERROR_CODE.INVALID_CREDENTIALS, message)

export const tokenExpired = (message = 'Сессия истекла, войдите заново') =>
  new AppError(401, ERROR_CODE.TOKEN_EXPIRED, message)

export const forbidden = (message = 'Недостаточно прав для этого действия') =>
  new AppError(403, ERROR_CODE.FORBIDDEN, message)

/**
 * What the user reads when a record is missing.
 *
 * Callers name the resource the way the code does (`Project`, `Render job`);
 * the interface is Russian, so the sentence comes from this table and an
 * unlisted name falls back to a neutral phrase rather than leaking English.
 */
const NOT_FOUND_MESSAGE: Record<string, string> = {
  Asset: 'Ассет не найден',
  Budget: 'Бюджет не найден',
  Client: 'Клиент не найден',
  Comment: 'Комментарий не найден',
  'Parent comment': 'Комментарий, на который вы отвечаете, не найден',
  Department: 'Отдел не найден',
  Document: 'Документ не найден',
  Employee: 'Сотрудник не найден',
  Episode: 'Эпизод не найден',
  Expense: 'Расход не найден',
  Invoice: 'Счёт не найден',
  Payment: 'Платёж не найден',
  Notification: 'Уведомление не найдено',
  'Payroll entry': 'Начисление не найдено',
  PipelineTemplate: 'Шаблон пайплайна не найден',
  'Prerequisite task': 'Задача-предшественник не найдена',
  Project: 'Проект не найден',
  'Project member': 'Участник проекта не найден',
  'Render job': 'Задание рендера не найдено',
  Review: 'Согласование не найдено',
  Revision: 'Правка не найдена',
  Role: 'Роль не найдена',
  Scene: 'Сцена не найдена',
  Shot: 'Шот не найден',
  'Shot stage': 'Этап шота не найден',
  Stage: 'Этап не найден',
  Target: 'Объект не найден',
  Task: 'Задача не найдена',
  'Timesheet entry': 'Запись табеля не найдена',
  'Upload session': 'Загрузка не найдена или уже завершена',
  User: 'Пользователь не найден',
  Version: 'Версия не найдена'
}

export const notFound = (resource = '') =>
  new AppError(404, ERROR_CODE.NOT_FOUND, NOT_FOUND_MESSAGE[resource] ?? 'Запись не найдена')

export const conflict = (message: string) =>
  new AppError(409, ERROR_CODE.CONFLICT, message)
