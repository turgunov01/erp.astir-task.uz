/** Shared API envelope (spec 66, 67). Both sides import these, so shapes cannot drift. */

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  pages: number
}

export interface ApiListResponse<T> {
  data: T[]
  meta: PaginationMeta
}

export interface ApiErrorBody {
  success: false
  error: {
    code: string
    message: string
    /** Field-level validation detail, keyed by dotted path. */
    details?: Record<string, string[]>
  }
}

export interface ListQuery {
  page?: number
  limit?: number
  search?: string
  sort?: string
  order?: 'asc' | 'desc'
}

/** Machine-readable error codes. The UI maps these to localized copy. */
export const ERROR_CODE = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
} as const
export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 20,
  maxLimit: 100
} as const

/** Authenticated principal attached to every request by the auth middleware. */
export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: import('./enums').Role
  avatarUrl: string | null
  clientId: string | null
}
