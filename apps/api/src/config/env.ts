import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Environment contract (spec 68, 91).
 *
 * Validated at boot so a missing secret fails loudly on startup rather than
 * on the first request that needs it.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // Loopback by default so the dev API is not exposed on the LAN.
  HOST: z.string().default('127.0.0.1'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),

  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),

  APP_URL: z.string().url().default('http://127.0.0.1:9990'),
  API_URL: z.string().url().default('http://127.0.0.1:4000'),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.coerce.boolean().default(false),

  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2', 'minio', 'gcs']).default('local'),
  STORAGE_PATH: z.string().default('./storage'),

  /*
   * Mail is optional: without it verification codes go to the log instead of
   * an inbox, so the studio can run before SMTP credentials exist.
   */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map(issue => '  - ' + issue.path.join('.') + ': ' + issue.message)
    .join(String.fromCharCode(10))
  console.error('Invalid environment configuration:')
  console.error(issues)
  process.exit(1)
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'
