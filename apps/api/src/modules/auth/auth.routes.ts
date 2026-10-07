import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  forgotPasswordSchema,
  loginSchema,
  resendCodeSchema,
  resetPasswordSchema,
  resetTokenCheckSchema,
  verifyCodeSchema
} from '@astir/validation'
import { validate } from '../../middleware/validate'
import { authenticate } from '../../middleware/auth'
import { t } from '../../i18n'
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  resendCodeHandler,
  verifyCodeHandler
} from './auth.controller'
import {
  checkResetTokenHandler,
  forgotEmailLimiter,
  forgotIpLimiter,
  forgotPasswordHandler,
  resetLimiter,
  resetPasswordHandler
} from './password-reset.controller'

/**
 * Login is rate limited per IP to blunt credential stuffing (spec 69).
 * Successful logins do not count toward the limit.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // A function, so the sentence is worded per request, in the reader's language.
  message: () => ({
    success: false,
    error: { code: 'RATE_LIMITED', message: t('common.errors.loginRateLimited') }
  })
})

export const authRouter = Router()

authRouter.post('/login', loginLimiter, validate(loginSchema), loginHandler)
// Verification shares the login limiter: it is the same credential check.
authRouter.post('/verify-code', loginLimiter, validate(verifyCodeSchema), verifyCodeHandler)
authRouter.post('/resend-code', loginLimiter, validate(resendCodeSchema), resendCodeHandler)
authRouter.post('/refresh', refreshHandler)
authRouter.post('/logout', logoutHandler)
authRouter.get('/me', authenticate, meHandler)

/*
 * Password recovery. The token travels in POST bodies, never in a query
 * string, so it stays out of access logs and Referer headers.
 */
authRouter.post(
  '/forgot-password',
  // Malformed input is refused before it is counted: it never sends anything.
  validate(forgotPasswordSchema),
  forgotIpLimiter,
  forgotEmailLimiter,
  forgotPasswordHandler
)
authRouter.post('/reset-password/check', resetLimiter, validate(resetTokenCheckSchema), checkResetTokenHandler)
authRouter.post('/reset-password', resetLimiter, validate(resetPasswordSchema), resetPasswordHandler)
