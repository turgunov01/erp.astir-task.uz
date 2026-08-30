import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { loginSchema, resendCodeSchema, verifyCodeSchema } from '@astir/validation'
import { validate } from '../../middleware/validate'
import { authenticate } from '../../middleware/auth'
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  resendCodeHandler,
  verifyCodeHandler
} from './auth.controller'

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
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' }
  }
})

export const authRouter = Router()

authRouter.post('/login', loginLimiter, validate(loginSchema), loginHandler)
// Verification shares the login limiter: it is the same credential check.
authRouter.post('/verify-code', loginLimiter, validate(verifyCodeSchema), verifyCodeHandler)
authRouter.post('/resend-code', loginLimiter, validate(resendCodeSchema), resendCodeHandler)
authRouter.post('/refresh', refreshHandler)
authRouter.post('/logout', logoutHandler)
authRouter.get('/me', authenticate, meHandler)
