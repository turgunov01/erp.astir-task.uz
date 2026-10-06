import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { Permission } from '@astir/types'
import { prisma } from '../lib/prisma'
import { hasPermission } from '../lib/rbac'
import { forbidden, tokenExpired, unauthenticated } from '../lib/errors'
import { ACCESS_COOKIE, verifyAccessToken } from '../modules/auth/tokens'
import { notePresence } from '../modules/attendance/presence'

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
      throw unauthenticated('Сессия недействительна, войдите заново')
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

    if (!user) throw unauthenticated('Учётная запись больше не существует')
    if (!user.isActive) throw forbidden('Учётная запись отключена')

    const { isActive: _isActive, ...authUser } = user
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
