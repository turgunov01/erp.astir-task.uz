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

export const unauthenticated = (message = 'Authentication required') =>
  new AppError(401, ERROR_CODE.UNAUTHENTICATED, message)

export const invalidCredentials = (message = 'Invalid email or password') =>
  new AppError(401, ERROR_CODE.INVALID_CREDENTIALS, message)

export const tokenExpired = (message = 'Session expired') =>
  new AppError(401, ERROR_CODE.TOKEN_EXPIRED, message)

export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError(403, ERROR_CODE.FORBIDDEN, message)

export const notFound = (resource = 'Resource') =>
  new AppError(404, ERROR_CODE.NOT_FOUND, resource + ' not found')

export const conflict = (message: string) =>
  new AppError(409, ERROR_CODE.CONFLICT, message)
