import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { ERROR_CODE, type Permission } from '@astir/types'
import { prisma } from '../lib/prisma'
import { hasPermission } from '../lib/rbac'
import { AppError, forbidden, tokenExpired, unauthenticated } from '../lib/errors'
import { ACCESS_COOKIE, verifyAccessToken } from '../modules/auth/tokens'
import { notePresence } from '../modules/attendance/presence'
import { rememberUserLocale } from '../lib/request-context'
import { t } from '../i18n'

function extractToken(req: Request): string | null {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) return header.slice(7)
  const cookie = req.cookies?.[ACCESS_COOKIE]
  return typeof cookie === 'string' && cookie.length > 0 ? cookie : null
}

/**
 * A password reset ends every session, including access tokens already handed
 * out: one issued before the reset second is refused. jsonwebtoken floors
 * `iat` to whole seconds, so the comparison is made in seconds too.
 */
function issuedBeforeRevocation(iat: number | undefined, revokedAt: Date | null): boolean {
  if (!revokedAt) return false
  return typeof iat !== 'number' || iat < Math.floor(revokedAt.getTime() / 1000)
}

/**
 * What a session may do while it still holds a password a manager set: say
 * who it is, replace the password, and pick the language to read the form in.
 * Everything else waits, so a password somebody else knows never opens the
 * studio's data.
 */
const BEFORE_PASSWORD_CHANGE = new Set([
  'GET /api/auth/me',
  'POST /api/auth/set-password',
  'PATCH /api/users/me'
])

function allowedBeforePasswordChange(req: Request): boolean {
  const path = (req.originalUrl.split('?')[0] ?? '').replace(/\/+$/, '')
  return BEFORE_PASSWORD_CHANGE.has(req.method + ' ' + path)
}

/**
 * Verifies the access token and loads the current user.
 *
 * The user row is re-read on every request rather than trusted from the token,
 * so deactivating an account or changing a role takes effect immediately
 * instead of waiting for the access token to expire.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req)
    if (!token) throw unauthenticated()

    let payload
    try {
      payload = verifyAccessToken(token)
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) throw tokenExpired()
      throw unauthenticated(t('common.errors.sessionInvalid'))
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        clientId: true,
        locale: true,
        isActive: true,
        sessionsRevokedAt: true,
        mustChangePassword: true
      }
    })

    if (!user) throw unauthenticated(t('common.errors.accountGone'))
    // From here on every message in this request is in the user's own language.
    rememberUserLocale(user.locale)
    if (!user.isActive) throw forbidden(t('common.errors.accountDisabled'))
    if (issuedBeforeRevocation(payload.iat, user.sessionsRevokedAt)) {
      throw unauthenticated(t('common.errors.sessionRevoked'))
    }

    if (user.mustChangePassword && !allowedBeforePasswordChange(req)) {
      throw new AppError(
        403,
        ERROR_CODE.PASSWORD_CHANGE_REQUIRED,
        t('auth.account.passwordChangeRequired')
      )
    }

    const { isActive: _isActive, sessionsRevokedAt: _revokedAt, ...authUser } = user
    req.user = authUser
    // Attendance: throttled, detached, never fails the request.
    notePresence(user.id)
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Guard a route behind one permission (spec 4, 99).
 *
 * The check goes through the effective matrix — the studio's edits from
 * Settings over the compiled defaults — so a change there takes effect
 * without a deploy.
 */
export function requirePermission(permission: Permission) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(unauthenticated())
      if (!(await hasPermission(req.user.role, permission))) {
        return next(forbidden())
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
