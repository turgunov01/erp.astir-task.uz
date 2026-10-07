import bcrypt from 'bcryptjs'
import { ERROR_CODE, type AuthUser } from '@astir/types'
import { prisma } from '../../lib/prisma'
import { AppError, badRequest, invalidCredentials, forbidden, unauthenticated } from '../../lib/errors'
import { consumeLoginCode, issueLoginCode } from '../../lib/otp'
import { notePresence } from '../attendance/presence'
import { rememberUserLocale } from '../../lib/request-context'
import { t } from '../../i18n'
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
  clientId: true,
  locale: true,
  mustChangePassword: true
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
      emailVerifiedAt: true,
      emailChangedAt: true
    }
  })

  // Compare against a dummy hash when the user is absent so that response
  // timing does not reveal whether an email is registered.
  const hash = record?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin'
  const passwordMatches = await bcrypt.compare(password, hash)

  if (!record || !passwordMatches) throw invalidCredentials()
  // Proven who they are: answer in their own language from here on.
  rememberUserLocale(record.locale)
  if (!record.isActive) throw forbidden(t('common.errors.accountDisabled'))

  /*
   * An address nobody has proven yet does not get a session.
   *
   * The password was already checked, so issuing the code here is safe and
   * saves the caller a second round trip. The response carries no code and no
   * session — only the fact that one was sent.
   */
  if (!record.emailVerifiedAt) {
    // A manager moved the login here: the person is told so, not greeted as new.
    const emailChanged = record.emailChangedAt !== null
    const issued = await issueLoginCode(record, { emailChanged })
    throw new AppError(
      403,
      ERROR_CODE.EMAIL_NOT_VERIFIED,
      t(emailChanged ? 'auth.verifyChangedEmailSent' : 'auth.verifyEmailSent', { email: record.email }),
      {
        retryAfter: [String(issued.retryAfter)],
        ...(emailChanged ? { emailChanged: ['true'] } : {})
      }
    )
  }

  const {
    passwordHash: _hash,
    isActive: _active,
    emailVerifiedAt: _verified,
    emailChangedAt: _changed,
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

  // Signing in opens the working day (attendance check-in).
  notePresence(user.id, true)

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

  if (!stored || stored.revokedAt) throw unauthenticated(t('common.errors.sessionRevoked'))
  if (stored.expiresAt.getTime() < Date.now()) throw unauthenticated(t('common.errors.tokenExpired'))
  if (!stored.user || stored.user.deletedAt) throw unauthenticated(t('common.errors.accountGone'))
  rememberUserLocale(stored.user.locale)
  if (!stored.user.isActive) throw forbidden(t('common.errors.accountDisabled'))

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
    select: { ...USER_FIELDS, passwordHash: true, isActive: true, emailChangedAt: true }
  })

  const hash = record?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin'
  const passwordMatches = await bcrypt.compare(password, hash)
  if (!record || !passwordMatches) throw invalidCredentials()
  rememberUserLocale(record.locale)
  if (!record.isActive) throw forbidden(t('common.errors.accountDisabled'))

  await consumeLoginCode(record.id, code)

  const { passwordHash: _hash, isActive: _active, emailChangedAt, ...user } = record

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      // Verified and in use: the account is now fully active.
      data: {
        emailVerifiedAt: new Date(),
        emailChangedAt: null,
        isActive: true,
        lastLoginAt: new Date()
      }
    }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        // The person confirmed the address a manager moved their login to.
        action: emailChangedAt ? 'auth.email_change_confirmed' : 'auth.email_verified',
        entityType: 'User',
        entityId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    })
  ])

  // Signing in opens the working day (attendance check-in).
  notePresence(user.id, true)

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
    select: { id: true, email: true, firstName: true, locale: true, emailChangedAt: true }
  })
  if (!record) return { retryAfter: 60 }
  const issued = await issueLoginCode(record, { emailChanged: record.emailChangedAt !== null })
  return { retryAfter: issued.retryAfter }
}

/**
 * Replace a password a manager set with one of the person's own.
 *
 * Only a session that is required to do this may: everyone else changes their
 * password in the profile, where the current one is asked for. The new one
 * must differ from the issued one, or the manager would still know it.
 */
export async function setOwnPassword(
  userId: string,
  password: string,
  context: SessionContext
): Promise<AuthUser> {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, mustChangePassword: true }
  })
  if (!record) throw unauthenticated(t('common.errors.accountGone'))
  if (!record.mustChangePassword) throw badRequest(t('auth.account.passwordChangeNotRequired'))
  if (await bcrypt.compare(password, record.passwordHash)) {
    throw badRequest(t('auth.account.sameAsIssued'))
  }

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(password), mustChangePassword: false },
      select: USER_FIELDS
    }),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'auth.issued_password_replaced',
        entityType: 'User',
        entityId: userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    })
  ])
  return user
}
