import { prisma } from '../../lib/prisma'
import { sendMail, type Mail } from '../../lib/mailer'
import { logger } from '../../lib/logger'
import { absoluteUrl, publicLogo, renderLetterHtml, type LetterFrame } from '../../lib/email-layout'
import { studioSettings } from '../../lib/settings'
import { recipientLocale, translatorFor, type Locale } from '../../i18n'
import { frameText, type LetterRecipient } from '../auth/password-reset-email'
import type { LoginChanges } from './employees.service'

/**
 * The letters a person gets when a manager changes their login.
 *
 * The old address hears that the login moved — whoever reads it is the one
 * who must know where to sign in now. A set password is announced without the
 * password itself: that travels from the manager to the person, not by mail.
 */

async function letter(
  recipient: LetterRecipient,
  locale: Locale,
  key: 'loginEmailChangedEmail' | 'passwordSetEmail',
  values: Record<string, string>
): Promise<Mail> {
  const settings = await studioSettings()
  const t = translatorFor(locale)
  const studio = settings.name
  const frame: LetterFrame = {
    locale,
    studio,
    logoUrl: publicLogo(settings.logoUrl),
    greeting: t('auth.resetEmail.greeting', { name: recipient.firstName }),
    title: t(`auth.${key}.title` as const),
    paragraphs: [t(`auth.${key}.body` as const, { studio, ...values })],
    action: { label: t(`auth.${key}.action` as const), url: absoluteUrl('/login') },
    notes: [t(`auth.${key}.notYou` as const)]
  }
  return {
    to: recipient.email,
    subject: t(`auth.${key}.subject` as const, { studio }),
    text: frameText(frame),
    html: renderLetterHtml(frame)
  }
}

export function renderLoginEmailChangedEmail(
  recipient: LetterRecipient,
  newEmail: string,
  locale: Locale
): Promise<Mail> {
  return letter(recipient, locale, 'loginEmailChangedEmail', { email: newEmail })
}

export function renderPasswordSetEmail(recipient: LetterRecipient, locale: Locale): Promise<Mail> {
  return letter(recipient, locale, 'passwordSetEmail', {})
}

/** Best effort: the change is saved whether or not the mail goes out. */
export async function notifyLoginChanges(userId: string, changes: LoginChanges): Promise<void> {
  if (!changes.previousEmail && !changes.passwordSet) return
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, locale: true }
    })
    if (!user) return
    const locale = await recipientLocale(user.locale)

    if (changes.previousEmail) {
      await sendMail(await renderLoginEmailChangedEmail(
        { email: changes.previousEmail, firstName: user.firstName }, user.email, locale
      ))
    }
    if (changes.passwordSet) {
      await sendMail(await renderPasswordSetEmail(user, locale))
    }
  } catch (err) {
    logger.error({ err, userId }, 'login change letter failed')
  }
}
