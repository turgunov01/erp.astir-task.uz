import { createHash, randomInt } from 'node:crypto'
import { prisma } from './prisma'
import { sendMail } from './mailer'
import { badRequest, forbidden } from './errors'

/**
 * One-time codes emailed to prove an address.
 *
 * The code is six digits so it can be read off a phone and typed, which puts the
 * safety entirely on the limits around it: a short life, few guesses, and only
 * the hash in the database.
 */

const CODE_TTL_MINUTES = 15
const MAX_ATTEMPTS = 5
/** Codes are only issued this often per account, so nobody can be mail-bombed. */
const RESEND_COOLDOWN_SECONDS = 60

export const OTP_PURPOSE = 'LOGIN'

function hash(code: string) {
  return createHash('sha256').update(code).digest('hex')
}

function generate() {
  // randomInt is uniform and crypto-backed; Math.random is not fit for this.
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export interface IssueResult {
  /** False when SMTP is unconfigured and the code only reached the log. */
  delivered: boolean
  /** Seconds until another code may be requested. */
  retryAfter: number
}

/**
 * Issue a fresh code, replacing any that is still outstanding.
 *
 * Replacing rather than adding means an older message stops working once a new
 * one is requested, which is what "we sent a new code" is understood to mean.
 */
export async function issueLoginCode(user: {
  id: string
  email: string
  firstName: string
}): Promise<IssueResult> {
  const recent = await prisma.emailCode.findFirst({
    where: { userId: user.id, purpose: OTP_PURPOSE, consumedAt: null },
    orderBy: { createdAt: 'desc' }
  })

  if (recent) {
    const age = (Date.now() - recent.createdAt.getTime()) / 1000
    if (age < RESEND_COOLDOWN_SECONDS) {
      return { delivered: false, retryAfter: Math.ceil(RESEND_COOLDOWN_SECONDS - age) }
    }
  }

  const code = generate()

  await prisma.$transaction([
    prisma.emailCode.deleteMany({
      where: { userId: user.id, purpose: OTP_PURPOSE, consumedAt: null }
    }),
    prisma.emailCode.create({
      data: {
        userId: user.id,
        codeHash: hash(code),
        purpose: OTP_PURPOSE,
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000)
      }
    })
  ])

  const { delivered } = await sendMail({
    to: user.email,
    subject: 'Код подтверждения входа — Aster ERP',
    text: [
      user.firstName + ', здравствуйте.',
      '',
      'Код для подтверждения входа: ' + code,
      '',
      'Код действует ' + CODE_TTL_MINUTES + ' минут и вводится один раз.',
      'Если вход выполняли не вы — сообщите администратору студии.'
    ].join('\n')
  })

  return { delivered, retryAfter: RESEND_COOLDOWN_SECONDS }
}

/**
 * Check a submitted code and burn it.
 *
 * A wrong guess counts against the code, not the account: locking the account
 * would let anyone lock out a colleague by guessing badly on purpose.
 */
export async function consumeLoginCode(userId: string, code: string): Promise<void> {
  const record = await prisma.emailCode.findFirst({
    where: { userId, purpose: OTP_PURPOSE, consumedAt: null },
    orderBy: { createdAt: 'desc' }
  })

  if (!record) throw badRequest('Код не запрашивался или уже использован')

  if (record.expiresAt < new Date()) {
    await prisma.emailCode.delete({ where: { id: record.id } })
    throw badRequest('Срок действия кода истёк, запросите новый')
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.emailCode.delete({ where: { id: record.id } })
    throw forbidden('Слишком много попыток, запросите новый код')
  }

  if (record.codeHash !== hash(code.trim())) {
    await prisma.emailCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } }
    })
    throw badRequest('Неверный код')
  }

  await prisma.emailCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() }
  })
}

/** Housekeeping for codes nobody came back for. */
export async function purgeExpiredCodes() {
  const result = await prisma.emailCode.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  })
  return result.count
}
