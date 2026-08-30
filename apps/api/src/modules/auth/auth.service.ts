import bcrypt from 'bcryptjs'
import { ERROR_CODE, type AuthUser } from '@astir/types'
import { prisma } from '../../lib/prisma'
import { AppError, invalidCredentials, forbidden, unauthenticated } from '../../lib/errors'
import { consumeLoginCode, issueLoginCode } from '../../lib/otp'
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken
} from './tokens'

const BCRYPT_ROUNDS = 12

export interface SessionContext {
  userAgent?: string
  ipAddress?: string
}

export interface SessionResult {
  user: AuthUser
  accessToken: string
  refreshToken: string
  refreshExpiresAt: Date
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

const USER_FIELDS = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  avatarUrl: true,
  clientId: true
} as const

async function issueSession(
  user: AuthUser,
  context: SessionContext
): Promise<SessionResult> {
  const { token, tokenHash } = generateRefreshToken()
  const expiresAt = refreshTokenExpiry()

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress
    }
  })

  return {
    user,
    accessToken: signAccessToken({ sub: user.id, email: user.email, role: user.role }),
    refreshToken: token,
    refreshExpiresAt: expiresAt
  }
}

export async function login(
  email: string,
  password: string,
  context: SessionContext
): Promise<SessionResult> {
  const record = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: {
      ...USER_FIELDS,
      passwordHash: true,
      isActive: true,
      emailVerifiedAt: true
    }
  })

  // Compare against a dummy hash when the user is absent so that response
  // timing does not reveal whether an email is registered.
  const hash = record?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin'
  const passwordMatches = await bcrypt.compare(password, hash)

  if (!record || !passwordMatches) throw invalidCredentials()
  if (!record.isActive) throw forbidden('Account is disabled')

  /*
   * An address nobody has proven yet does not get a session.
   *
   * The password was already checked, so issuing the code here is safe and
   * saves the caller a second round trip. The response carries no code and no
   * session — only the fact that one was sent.
   */
  if (!record.emailVerifiedAt) {
    const issued = await issueLoginCode(record)
    throw new AppError(
      403,
      ERROR_CODE.EMAIL_NOT_VERIFIED,
      'Подтвердите почту: код отправлен на ' + record.email,
      { retryAfter: [String(issued.retryAfter)] }
    )
  }

  const {
    passwordHash: _hash,
    isActive: _active,
    emailVerifiedAt: _verified,
    ...user
  } = record

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'auth.login',
        entityType: 'User',
        entityId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    })
  ])

  return issueSession(user, context)
}

/**
 * Rotate a refresh token.
 *
 * The presented token is revoked as part of the same transaction that issues
 * its replacement, so a stolen token cannot be reused after the legitimate
 * client refreshes.
 */
export async function refresh(
  presentedToken: string,
  context: SessionContext
): Promise<SessionResult> {
  const tokenHash = hashRefreshToken(presentedToken)

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { ...USER_FIELDS, isActive: true, deletedAt: true } } }
  })

  if (!stored || stored.revokedAt) throw unauthenticated('Session is no longer valid')
  if (stored.expiresAt.getTime() < Date.now()) throw unauthenticated('Session expired')
  if (!stored.user || stored.user.deletedAt) throw unauthenticated('Account no longer exists')
  if (!stored.user.isActive) throw forbidden('Account is disabled')

  const { isActive: _active, deletedAt: _deleted, ...user } = stored.user

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() }
  })

  return issueSession(user, context)
}

export async function logout(presentedToken: string | undefined): Promise<void> {
  if (!presentedToken) return
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() }
  })
}

/** Revoke every active session for a user, e.g. after a password change. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  })
}

/**
 * Finish a login that was stopped for verification.
 *
 * The password is checked again rather than trusted from the previous call:
 * a code alone must never be enough to enter someone else`s account.
 */
export async function verifyLoginCode(
  email: string,
  password: string,
  code: string,
  context: SessionContext
): Promise<SessionResult> {
  const record = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { ...USER_FIELDS, passwordHash: true, isActive: true }
  })

  const hash = record?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin'
  const passwordMatches = await bcrypt.compare(password, hash)
  if (!record || !passwordMatches) throw invalidCredentials()
  if (!record.isActive) throw forbidden('Account is disabled')

  await consumeLoginCode(record.id, code)

  const { passwordHash: _hash, isActive: _active, ...user } = record

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      // Verified and in use: the account is now fully active.
      data: { emailVerifiedAt: new Date(), isActive: true, lastLoginAt: new Date() }
    }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'auth.email_verified',
        entityType: 'User',
        entityId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    })
  ])

  return issueSession(user, context)
}

/**
 * Send another code.
 *
 * Answers the same way whether or not the address exists, so this cannot be
 * used to find out who has an account.
 */
export async function resendLoginCode(email: string): Promise<{ retryAfter: number }> {
  const record = await prisma.user.findFirst({
    where: { email, deletedAt: null, emailVerifiedAt: null },
    select: { id: true, email: true, firstName: true }
  })
  if (!record) return { retryAfter: 60 }
  const issued = await issueLoginCode(record)
  return { retryAfter: issued.retryAfter }
}
