import { EMAIL_NOTIFICATION_TYPES, type NotificationType } from '@astir/types'
import { absoluteUrl, publicLogo, renderLetterHtml } from './email-layout'
import { logger } from './logger'
import { mailIsConfigured, sendMail, type Mail } from './mailer'
import { prisma } from './prisma'
import { studioSettings } from './settings'
import { translatorFor, type Locale, type MessageKey } from '../i18n'

/**
 * The email channel for notifications.
 *
 * Runs after the triggering write has committed (see notify.ts), on its own,
 * so a slow or broken mail server never slows or fails the request. Every
 * reason not to send — the type has no letter, SMTP is not set up, the person
 * has no address, is deactivated or switched email off for this type — ends
 * quietly here.
 *
 * The letter is in the recipient's language: notify() has already worded the
 * title and body for them and passes that language along for the frame
 * (greeting, button, footer).
 */

export interface EmailNotification {
  userId: string
  type: string
  /** Already worded in `locale` by notify(). */
  title: string
  body?: string | null
  linkUrl?: string | null
  entityType?: string
  locale: Locale
}

const EMAIL_TYPES = new Set<string>(EMAIL_NOTIFICATION_TYPES)

export function hasEmailChannel(type: string): type is NotificationType {
  return EMAIL_TYPES.has(type)
}

/** What the button in the letter says, by what it opens. */
const ACTION_KEY: Record<string, MessageKey> = {
  Task: 'team.email.openTask',
  Project: 'team.email.openProject'
}

/** Opt-out model, same as in-app: no row means the channel is on. */
async function emailEnabled(userId: string, type: string): Promise<boolean> {
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId_type_channel: { userId, type: type as never, channel: 'EMAIL' } },
    select: { enabled: true }
  })
  return preference?.enabled !== false
}

interface Letter {
  locale: Locale
  studio: string
  logoUrl: string | null
  greeting: string
  title: string
  body: string | null
  link: string | null
  actionLabel: string
  profileLink: string
  unsubscribeText: string
  unsubscribeLink: string
}

function renderText(letter: Letter): string {
  return [
    letter.greeting,
    '',
    letter.title,
    ...(letter.body ? [letter.body] : []),
    ...(letter.link ? ['', letter.actionLabel + ': ' + letter.link] : []),
    '',
    '—',
    letter.studio,
    letter.unsubscribeText
  ].join('\n')
}

/** The shared branded frame, with the opt-out link in the footer. */
function renderHtml(letter: Letter): string {
  return renderLetterHtml({
    locale: letter.locale,
    studio: letter.studio,
    logoUrl: letter.logoUrl,
    greeting: letter.greeting,
    title: letter.title,
    paragraphs: letter.body ? [letter.body] : [],
    action: letter.link ? { label: letter.actionLabel, url: letter.link } : undefined,
    footerLink: { label: letter.unsubscribeLink, url: letter.profileLink }
  })
}

/**
 * The finished letter for one recipient, without sending it.
 *
 * Split out so the wording can be checked (and previewed) without SMTP.
 */
export async function renderNotificationEmail(
  input: Omit<EmailNotification, 'userId' | 'type'>,
  recipient: { email: string, firstName: string | null }
): Promise<Mail> {
  const settings = await studioSettings()
  const t = translatorFor(input.locale)
  const profileLink = absoluteUrl('/profile')
  const letter: Letter = {
    locale: input.locale,
    studio: settings.name,
    logoUrl: publicLogo(settings.logoUrl),
    greeting: recipient.firstName
      ? t('team.email.greetingNamed', { name: recipient.firstName })
      : t('team.email.greeting'),
    title: input.title,
    body: input.body ?? null,
    link: input.linkUrl ? absoluteUrl(input.linkUrl) : null,
    actionLabel: t(ACTION_KEY[input.entityType ?? ''] ?? 'team.email.open'),
    profileLink,
    unsubscribeText: t('team.email.unsubscribeText', { link: profileLink }),
    unsubscribeLink: t('team.email.unsubscribeLink')
  }

  return {
    to: recipient.email,
    subject: input.title + ' — ' + settings.name,
    text: renderText(letter),
    html: renderHtml(letter)
  }
}

/** Send the email copy of a notification, if everything says it should go. */
export async function deliverNotificationEmail(input: EmailNotification): Promise<void> {
  if (!hasEmailChannel(input.type)) return

  try {
    if (!(await mailIsConfigured())) return

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, firstName: true, isActive: true }
    })
    if (!user?.email || !user.isActive) return
    if (!(await emailEnabled(input.userId, input.type))) return

    const { delivered } = await sendMail(await renderNotificationEmail(input, user))
    if (delivered) logger.info({ userId: input.userId, type: input.type }, 'notification email sent')
  } catch (err) {
    logger.error({ err, userId: input.userId, type: input.type }, 'notification email failed')
  }
}
