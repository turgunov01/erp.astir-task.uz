import { ERROR_CODE, type ErrorCode } from '@astir/types'
import { t } from '../i18n'

/**
 * Typed application error. Every deliberate failure path throws one of these
 * so the error middleware can map it to the documented envelope (spec 67)
 * without guessing at status codes.
 *
 * Messages reach the user as they are, so they are always worded through
 * `t()` in the language of the request: `badRequest(t('finance.vatTooLarge'))`.
 * The defaults below already are.
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

export const unauthenticated = (message = t('common.errors.unauthenticated')) =>
  new AppError(401, ERROR_CODE.UNAUTHENTICATED, message)

export const invalidCredentials = (message = t('common.errors.invalidCredentials')) =>
  new AppError(401, ERROR_CODE.INVALID_CREDENTIALS, message)

export const tokenExpired = (message = t('common.errors.tokenExpired')) =>
  new AppError(401, ERROR_CODE.TOKEN_EXPIRED, message)

/**
 * The web client shows every FORBIDDEN as its own «Недостаточно прав» line,
 * whatever the message says, so a sentence the user must actually read goes
 * through badRequest instead.
 */
export const forbidden = (message = t('common.errors.forbidden')) =>
  new AppError(403, ERROR_CODE.FORBIDDEN, message)

/**
 * What the user reads when a record is missing.
 *
 * Callers name the resource the way the code does (`Project`, `Render job`);
 * the sentence comes from common.notFound.<key>, and an unlisted name falls
 * back to a neutral phrase rather than leaking English.
 */
const NOT_FOUND_KEY = {
  Asset: 'common.notFound.asset',
  Budget: 'common.notFound.budget',
  Client: 'common.notFound.client',
  Comment: 'common.notFound.comment',
  'Parent comment': 'common.notFound.parentComment',
  Department: 'common.notFound.department',
  Document: 'common.notFound.document',
  Employee: 'common.notFound.employee',
  Episode: 'common.notFound.episode',
  Expense: 'common.notFound.expense',
  Invoice: 'common.notFound.invoice',
  Payment: 'common.notFound.payment',
  Notification: 'common.notFound.notification',
  'Payroll entry': 'common.notFound.payrollEntry',
  PipelineTemplate: 'common.notFound.pipelineTemplate',
  'Prerequisite task': 'common.notFound.prerequisiteTask',
  Project: 'common.notFound.project',
  'Project member': 'common.notFound.projectMember',
  'Render job': 'common.notFound.renderJob',
  Review: 'common.notFound.review',
  Revision: 'common.notFound.revision',
  Role: 'common.notFound.role',
  Scene: 'common.notFound.scene',
  Shot: 'common.notFound.shot',
  'Shot stage': 'common.notFound.shotStage',
  Stage: 'common.notFound.stage',
  Target: 'common.notFound.target',
  Task: 'common.notFound.task',
  'Timesheet entry': 'common.notFound.timesheetEntry',
  'Upload session': 'common.notFound.uploadSession',
  User: 'common.notFound.user',
  Version: 'common.notFound.version'
} as const

type NotFoundResource = keyof typeof NOT_FOUND_KEY

function isNotFoundResource(value: string): value is NotFoundResource {
  return Object.prototype.hasOwnProperty.call(NOT_FOUND_KEY, value)
}

export const notFound = (resource = '') =>
  new AppError(
    404,
    ERROR_CODE.NOT_FOUND,
    isNotFoundResource(resource) ? t(NOT_FOUND_KEY[resource]) : t('common.errors.recordNotFound')
  )

export const conflict = (message: string) =>
  new AppError(409, ERROR_CODE.CONFLICT, message)
