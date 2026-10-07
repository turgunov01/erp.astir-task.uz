import crypto from 'node:crypto'
import { isDevelopment } from '../../config/env'
import { recordAudit } from '../../lib/activity'
import { absoluteUrl } from '../../lib/email-layout'
import { badRequest } from '../../lib/errors'
import { logger } from '../../lib/logger'
import { mailIsConfigured, sendMail, type Mail } from '../../lib/mailer'
import { prisma } from '../../lib/prisma'
import { recipientLocale, t } from '../../i18n'
import { hashPassword, type SessionContext } from './auth.service'
import { renderPasswordChangedEmail, renderResetEmail } from './password-reset-email'

/**
 * Password recovery by an emailed, single-use link.
 *
 * The token is 32 random bytes; only its SHA-256 lives in the database, so a
 * leaked table hands out nothing usable, and a lookup by hash is the
 * comparison (no string compare against a secret ever happens in JS).
 *
 * Asking for a link never says whether the address exists: the HTTP answer is
 * sent before any of this runs (see the controller), so neither the body nor
 * the timing differs.
 */

export const RESET_TOKEN_TTL_MINUTES = 60
const TOKEN_BYTES = 32

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function generateToken(): { token: string, tokenHash: string } {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

function resetUrl(token: string): string {
  const url = new URL(absoluteUrl('/reset-password'))
  url.searchParams.set('token', token)
  return url.href
}

/**
 * Send a letter, or say plainly why it was not sent.
 *
 * Without SMTP the shared mailer would write the whole body — the live link —
 * to the log. That is acceptable on a developer's machine and nowhere else, so
 * this path never reaches it unconfigured: production gets a warning only.
 */
async function deliver(mail: Mail, devLink: string | null, userId: string): Promise<void> {
  if (!(await mailIsConfigured())) {
    logger.warn({ userId }, 'password reset email not sent: SMTP is not configured')
    if (isDevelopment && devLink) {
      logger.warn({ userId, resetUrl: devLink }, 'development only: password reset link')
    }
    return
  }
  const { delivered } = await sendMail(mail)
  if (!delivered) logger.error({ userId }, 'password reset email could not be delivered')
}

/**
 * Issue a link for an active account with this address; do nothing otherwise.
 *
 * Earlier unused links of the same person stop working: "we sent you a new
 * link" must mean the old one is dead.
 */
export async function requestPasswordReset(email: string, context: SessionContext): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, email: true, firstName: true, isActive: true, locale: true }
  })
  if (!user || !user.isActive || !user.email) {
    logger.info({ reason: user ? 'inactive' : 'unknown' }, 'password reset requested for no active account')
    return
  }

  const { token, tokenHash } = generateToken()
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
        createdIp: context.ipAddress
      }
    })
  ])

  await recordAudit({
    actorId: user.id,
    action: 'auth.password_reset_requested',
    entityType: 'User',
    entityId: user.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  })

  const link = resetUrl(token)
  const locale = await recipientLocale(user.locale)
  await deliver(await renderResetEmail(user, link, RESET_TOKEN_TTL_MINUTES, locale), link, user.id)
}

interface UsableToken {
  id: string
  user: { id: string, email: string, firstName: string, locale: string | null, emailVerifiedAt: Date | null }
}

/**
 * The stored token behind a presented one, if it can still be used.
 *
 * An expired link is named as such (the fix is the same, but the reader
 * understands what happened); everything else — unknown, used, the account
 * gone or disabled — reads as one "invalid or already used".
 */
async function usableToken(token: string): Promise<UsableToken> {
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          locale: true,
          isActive: true,
          deletedAt: true,
          emailVerifiedAt: true
        }
      }
    }
  })

  if (!stored || stored.usedAt) throw badRequest(t('auth.reset.linkInvalid'))
  if (stored.expiresAt.getTime() <= Date.now()) throw badRequest(t('auth.reset.linkExpired'))
  if (!stored.user.isActive || stored.user.deletedAt) throw badRequest(t('auth.reset.linkInvalid'))
  const { isActive: _active, deletedAt: _deleted, ...user } = stored.user
  return { id: stored.id, user }
}

/** Whether a link still works, so the page can say so before anyone types. */
export async function checkResetToken(token: string): Promise<{ valid: true }> {
  await usableToken(token)
  return { valid: true }
}

/**
 * Set a new password from a link.
 *
 * In one transaction: the token is claimed (conditionally, so two concurrent
 * submissions cannot both win), the password replaced, every refresh token
 * revoked and `sessionsRevokedAt` stamped so outstanding access tokens die too.
 *
 * Following a link from the mailbox proves the address as well as an emailed
 * code does, so an unverified address becomes verified here; otherwise the
 * person would be sent a code to the same mailbox on their next sign-in.
 */
export async function resetPassword(
  token: string,
  password: string,
  context: SessionContext
): Promise<void> {
  const record = await usableToken(token)
  const passwordHash = await hashPassword(password)
  const now = new Date()

  await prisma.$transaction(async tx => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now }
    })
    if (claimed.count !== 1) throw badRequest(t('auth.reset.linkInvalid'))

    await tx.user.update({
      where: { id: record.user.id },
      data: {
        passwordHash,
        sessionsRevokedAt: now,
        emailVerifiedAt: record.user.emailVerifiedAt ?? now
      }
    })
    await tx.refreshToken.updateMany({
      where: { userId: record.user.id, revokedAt: null },
      data: { revokedAt: now }
    })
    // Any other link still out there belongs to the password that is gone.
    await tx.passwordResetToken.deleteMany({ where: { userId: record.user.id, usedAt: null } })
    await recordAudit({
      actorId: record.user.id,
      action: 'auth.password_reset',
      entityType: 'User',
      entityId: record.user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    }, tx)
  })

  void notifyPasswordChanged(record.user)
}

/** The "your password was changed" letter; failures are logged, never thrown. */
async function notifyPasswordChanged(user: UsableToken['user']): Promise<void> {
  try {
    const locale = await recipientLocale(user.locale)
    await deliver(await renderPasswordChangedEmail(user, locale), null, user.id)
  } catch (err) {
    logger.error({ err, userId: user.id }, 'password changed email failed')
  }
}
