import type { NextFunction, Request, Response } from 'express'
import { effectivePermissions } from '../../lib/rbac'
import { sendItem, sendNoContent } from '../../lib/http'
import { unauthenticated } from '../../lib/errors'
import { t } from '../../i18n'
import * as authService from './auth.service'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions
} from './tokens'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

function sessionContext(req: Request): authService.SessionContext {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip
  }
}

function setSessionCookies(res: Response, result: authService.SessionResult) {
  const refreshMaxAge = result.refreshExpiresAt.getTime() - Date.now()
  res.cookie(ACCESS_COOKIE, result.accessToken, cookieOptions(FIFTEEN_MINUTES_MS))
  res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(refreshMaxAge))
}

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body
    const result = await authService.login(email, password, sessionContext(req))
    setSessionCookies(res, result)
    return sendItem(res, {
      user: result.user,
      permissions: await effectivePermissions(result.user.role),
      accessToken: result.accessToken
    })
  } catch (err) {
    next(err)
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken
    if (!presented) throw unauthenticated(t('common.errors.sessionNotFound'))

    const result = await authService.refresh(presented, sessionContext(req))
    setSessionCookies(res, result)
    return sendItem(res, {
      user: result.user,
      permissions: await effectivePermissions(result.user.role),
      accessToken: result.accessToken
    })
  } catch (err) {
    next(err)
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logout(req.cookies?.[REFRESH_COOKIE])
    res.clearCookie(ACCESS_COOKIE, cookieOptions(0))
    res.clearCookie(REFRESH_COOKIE, cookieOptions(0))
    return sendNoContent(res)
  } catch (err) {
    next(err)
  }
}

export async function meHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return sendItem(res, {
      user: req.user,
      permissions: req.user ? await effectivePermissions(req.user.role) : []
    })
  } catch (err) {
    next(err)
  }
}

/**
 * Finish a login that stopped at verification.
 *
 * On success the session is issued exactly as a normal login would, so the
 * caller has nothing extra to handle afterwards.
 */
export async function verifyCodeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, code } = req.body
    const result = await authService.verifyLoginCode(
      email, password, code, sessionContext(req)
    )
    setSessionCookies(res, result)
    return sendItem(res, {
      user: result.user,
      permissions: await effectivePermissions(result.user.role),
      accessToken: result.accessToken
    })
  } catch (err) {
    next(err)
  }
}

/** Replace a password a manager set; the session carries on with the new one. */
export async function setPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw unauthenticated()
    const user = await authService.setOwnPassword(
      req.user.id, req.body.password, sessionContext(req)
    )
    return sendItem(res, {
      user,
      permissions: await effectivePermissions(user.role)
    })
  } catch (err) {
    next(err)
  }
}

export async function resendCodeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.resendLoginCode(req.body.email)
    return sendItem(res, result)
  } catch (err) {
    next(err)
  }
}
