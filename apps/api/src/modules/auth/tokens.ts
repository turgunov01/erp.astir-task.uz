import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { Role } from '@astir/types'
import { env } from '../../config/env'

export interface AccessTokenPayload {
  sub: string
  email: string
  role: Role
}

export const ACCESS_COOKIE = 'astir_access'
export const REFRESH_COOKIE = 'astir_refresh'

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'astir-erp'
  })
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'astir-erp'
  }) as AccessTokenPayload
}

/**
 * Refresh tokens are opaque random strings, not JWTs.
 *
 * Only the SHA-256 digest is stored, so a database leak cannot be replayed
 * against the API, and rotation can revoke a single session precisely.
 */
export function generateRefreshToken(): { token: string, tokenHash: string } {
  const token = crypto.randomBytes(48).toString('base64url')
  return { token, tokenHash: hashRefreshToken(token) }
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function refreshTokenExpiry(): Date {
  const expires = new Date()
  expires.setDate(expires.getDate() + env.REFRESH_TOKEN_TTL_DAYS)
  return expires
}

/** Cookie options shared by both tokens. */
export function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax' as const,
    domain: env.COOKIE_DOMAIN,
    path: '/',
    maxAge: maxAgeMs
  }
}
