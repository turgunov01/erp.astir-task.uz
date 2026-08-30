import pino from 'pino'
import { env, isDevelopment } from '../config/env'

/**
 * Structured logger (spec 90). No stray console.log in request paths.
 * Pretty transport only in development; production emits JSON lines.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isDevelopment
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.currentPassword',
      'req.body.confirmPassword'
    ],
    censor: '[redacted]'
  }
})
