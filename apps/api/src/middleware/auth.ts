import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { roleHasPermission, type Permission } from '@astir/types'
import { prisma } from '../lib/prisma'
import { forbidden, tokenExpired, unauthenticated } from '../lib/errors'
import { ACCESS_COOKIE, verifyAccessToken } from '../modules/auth/tokens'

function extractToken(req: Request): string | null {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) return header.slice(7)
  const cookie = req.cookies?.[ACCESS_COOKIE]
  return typeof cookie === 'string' && cookie.length > 0 ? cookie : null
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
      throw unauthenticated('Invalid access token')
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
        isActive: true
      }
    })

    if (!user) throw unauthenticated('Account no longer exists')
    if (!user.isActive) throw forbidden('Account is disabled')

    const { isActive: _isActive, ...authUser } = user
    req.user = authUser
    next()
  } catch (err) {
    next(err)
  }
}

/** Guard a route behind one permission from the central RBAC map (spec 4, 99). */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated())
    if (!roleHasPermission(req.user.role, permission)) {
      return next(forbidden('Missing permission: ' + permission))
    }
    next()
  }
}

/** Guard a route behind an explicit role list. */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated())
    if (!roles.includes(req.user.role)) return next(forbidden())
    next()
  }
}
