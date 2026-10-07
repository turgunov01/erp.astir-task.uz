import type { Mail } from '../../lib/mailer'
import { absoluteUrl, publicLogo, renderLetterHtml, type LetterFrame } from '../../lib/email-layout'
import { studioSettings } from '../../lib/settings'
import { translatorFor, type Locale } from '../../i18n'

/**
 * The two password-recovery letters, in the recipient's language: the link
 * itself, and the confirmation sent once the password has been changed.
 *
 * Rendering is kept apart from sending so the wording can be previewed and
 * checked without SMTP.
 */

export interface LetterRecipient {
  email: string
  firstName: string
}

/** The plain-text twin of a framed letter; shared with the account-change letters. */
export function frameText(frame: LetterFrame): string {
  return [
    frame.greeting,
    '',
    frame.title,
    ...frame.paragraphs,
    ...(frame.action ? ['', frame.action.label + ': ' + frame.action.url] : []),
    '',
    ...(frame.notes ?? []),
    '',
    '—',
    frame.studio
  ].join('\n')
}

export async function renderResetEmail(
  recipient: LetterRecipient,
  resetUrl: string,
  validMinutes: number,
  locale: Locale
): Promise<Mail> {
  const settings = await studioSettings()
  const t = translatorFor(locale)
  const studio = settings.name
  const frame: LetterFrame = {
    locale,
    studio,
    logoUrl: publicLogo(settings.logoUrl),
    greeting: t('auth.resetEmail.greeting', { name: recipient.firstName }),
    title: t('auth.resetEmail.title'),
    paragraphs: [t('auth.resetEmail.intro', { studio })],
    action: { label: t('auth.resetEmail.action'), url: resetUrl },
    notes: [
      t('auth.resetEmail.validity', { minutes: validMinutes }),
      t('auth.resetEmail.linkFallback') + ' ' + resetUrl,
      t('auth.resetEmail.notYou')
    ]
  }
  return {
    to: recipient.email,
    subject: t('auth.resetEmail.subject', { studio }),
    // The plain text already prints the link next to the action; no fallback line.
    text: frameText({ ...frame, notes: frame.notes?.filter(note => !note.includes(resetUrl)) }),
    html: renderLetterHtml(frame)
  }
}

export async function renderPasswordChangedEmail(
  recipient: LetterRecipient,
  locale: Locale
): Promise<Mail> {
  const settings = await studioSettings()
  const t = translatorFor(locale)
  const studio = settings.name
  const frame: LetterFrame = {
    locale,
    studio,
    logoUrl: publicLogo(settings.logoUrl),
    greeting: t('auth.resetEmail.greeting', { name: recipient.firstName }),
    title: t('auth.passwordChangedEmail.title'),
    paragraphs: [t('auth.passwordChangedEmail.body', { studio })],
    action: { label: t('auth.passwordChangedEmail.action'), url: absoluteUrl('/login') },
    notes: [t('auth.passwordChangedEmail.notYou')]
  }
  return {
    to: recipient.email,
    subject: t('auth.passwordChangedEmail.subject', { studio }),
    text: frameText(frame),
    html: renderLetterHtml(frame)
  }
}
