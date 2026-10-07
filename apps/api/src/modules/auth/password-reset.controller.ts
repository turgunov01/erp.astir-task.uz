import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { sendItem } from '../../lib/http'
import { logger } from '../../lib/logger'
import { t } from '../../i18n'
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions } from './tokens'
import * as passwordReset from './password-reset.service'

const HOUR_MS = 60 * 60 * 1000
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

/** Per address and per IP, an hour each: enough for a typo, too few to mail-bomb. */
const REQUESTS_PER_EMAIL_PER_HOUR = 5
const REQUESTS_PER_IP_PER_HOUR = 20
/** Using a link; tokens are 256-bit, this only keeps the endpoint quiet. */
const RESET_ATTEMPTS_PER_IP = 30

function context(req: Request) {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip }
}

/** The one answer to "send me a link", whatever happened behind it. */
function sendAccepted(res: Response) {
  return sendItem(res, { accepted: true, message: t('auth.reset.accepted') })
}

/** A short, stable label for an address in the log, without the address. */
function emailTag(email: unknown): string {
  return crypto.createHash('sha256').update(String(email ?? '')).digest('hex').slice(0, 12)
}

/*
 * Over the limit is still the neutral 200, with no rate-limit headers: a
 * different answer for "too many" would itself tell a prober something.
 */
export const forgotIpLimiter = rateLimit({
  windowMs: HOUR_MS,
  limit: REQUESTS_PER_IP_PER_HOUR,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn({ ip: req.ip }, 'password reset requests over the per-IP limit')
    sendAccepted(res)
  }
})

/** Runs after validation, so the key is the normalised address. */
export const forgotEmailLimiter = rateLimit({
  windowMs: HOUR_MS,
  limit: REQUESTS_PER_EMAIL_PER_HOUR,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: req => 'reset:' + emailTag(req.body?.email),
  handler: (req, res) => {
    logger.warn({ ip: req.ip, email: emailTag(req.body?.email) }, 'password reset requests over the per-address limit')
    sendAccepted(res)
  }
})

export const resetLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: RESET_ATTEMPTS_PER_IP,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: () => ({
    success: false,
    error: { code: 'RATE_LIMITED', message: t('common.errors.rateLimited') }
  })
})

/**
 * Answer first, work after.
 *
 * The lookup, token and letter happen once the response is on its way, so an
 * unknown address and a real one take the same time to answer.
 */
export function forgotPasswordHandler(req: Request, res: Response) {
  sendAccepted(res)
  passwordReset.requestPasswordReset(req.body.email, context(req)).catch(err => {
    logger.error({ err }, 'password reset request failed')
  })
}

export async function checkResetTokenHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return sendItem(res, await passwordReset.checkResetToken(req.body.token))
  } catch (err) {
    next(err)
  }
}

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await passwordReset.resetPassword(req.body.token, req.body.password, context(req))
    // Whatever session this browser held belonged to the old password.
    res.clearCookie(ACCESS_COOKIE, cookieOptions(0))
    res.clearCookie(REFRESH_COOKIE, cookieOptions(0))
    return sendItem(res, { changed: true, message: t('auth.reset.done') })
  } catch (err) {
    next(err)
  }
}
