import { EMAIL_NOTIFICATION_TYPES, type NotificationType } from '@astir/types'
import { env } from '../config/env'
import { logger } from './logger'
import { mailIsConfigured, sendMail } from './mailer'
import { prisma } from './prisma'
import { studioSettings } from './settings'

/**
 * The email channel for notifications.
 *
 * Runs after the triggering write has committed (see notify.ts), on its own,
 * so a slow or broken mail server never slows or fails the request. Every
 * reason not to send — the type has no letter, SMTP is not set up, the person
 * has no address, is deactivated or switched email off for this type — ends
 * quietly here.
 */

export interface EmailNotification {
  userId: string
  type: string
  title: string
  body?: string | null
  linkUrl?: string | null
  entityType?: string
}

const EMAIL_TYPES = new Set<string>(EMAIL_NOTIFICATION_TYPES)

export function hasEmailChannel(type: string): type is NotificationType {
  return EMAIL_TYPES.has(type)
}

/** What the button in the letter says, by what it opens. */
const ACTION_LABEL: Record<string, string> = {
  Task: 'Открыть задачу',
  Project: 'Открыть проект'
}

/** Opt-out model, same as in-app: no row means the channel is on. */
async function emailEnabled(userId: string, type: string): Promise<boolean> {
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId_type_channel: { userId, type: type as never, channel: 'EMAIL' } },
    select: { enabled: true }
  })
  return preference?.enabled !== false
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Links in a letter must be absolute; the app stores them relative. */
function absoluteUrl(path: string): string {
  return new URL(path, env.APP_URL).href
}

/** A logo only if it can load from a mail client, i.e. an absolute http(s) URL. */
function publicLogo(logoUrl: string | null): string | null {
  return logoUrl && /^https?:\/\//i.test(logoUrl) ? logoUrl : null
}

interface Letter {
  studio: string
  logoUrl: string | null
  greeting: string
  title: string
  body: string | null
  link: string | null
  actionLabel: string
  profileLink: string
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
    'Такие письма можно отключить в профиле: ' + letter.profileLink
  ].join('\n')
}

/** Table layout and inline styles: the only HTML mail clients agree on. */
function renderHtml(letter: Letter): string {
  const studio = escapeHtml(letter.studio)
  const brand = letter.logoUrl
    ? '<img src="' + escapeHtml(letter.logoUrl) + '" alt="' + studio + '" height="28" style="display:block;height:28px;border:0">'
    : '<span style="font-size:15px;font-weight:600;color:#111827">' + studio + '</span>'
  const button = letter.link
    ? '<tr><td style="padding:20px 0 4px">' +
      '<a href="' + escapeHtml(letter.link) + '" style="display:inline-block;background:#111827;color:#ffffff;' +
      'text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:8px">' +
      escapeHtml(letter.actionLabel) + '</a></td></tr>'
    : ''
  const body = letter.body
    ? '<tr><td style="padding-top:6px;font-size:14px;line-height:20px;color:#4b5563">' + escapeHtml(letter.body) + '</td></tr>'
    : ''

  return '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(letter.title) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px">' +
    '<tr><td style="padding:20px 24px;border-bottom:1px solid #f0f0f1">' + brand + '</td></tr>' +
    '<tr><td style="padding:24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">' +
    '<tr><td style="padding-bottom:12px;font-size:14px;color:#4b5563">' + escapeHtml(letter.greeting) + '</td></tr>' +
    '<tr><td style="font-size:17px;line-height:24px;font-weight:600;color:#111827">' + escapeHtml(letter.title) + '</td></tr>' +
    body + button +
    '</table></td></tr>' +
    '<tr><td style="padding:16px 24px;border-top:1px solid #f0f0f1;font-size:12px;line-height:18px;color:#9ca3af">' +
    studio + ' · <a href="' + escapeHtml(letter.profileLink) + '" style="color:#6b7280">отключить такие письма в профиле</a>' +
    '</td></tr></table></td></tr></table></body></html>'
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

    const settings = await studioSettings()
    const letter: Letter = {
      studio: settings.name,
      logoUrl: publicLogo(settings.logoUrl),
      greeting: user.firstName ? user.firstName + ', здравствуйте.' : 'Здравствуйте.',
      title: input.title,
      body: input.body ?? null,
      link: input.linkUrl ? absoluteUrl(input.linkUrl) : null,
      actionLabel: ACTION_LABEL[input.entityType ?? ''] ?? 'Открыть',
      profileLink: absoluteUrl('/profile')
    }

    const { delivered } = await sendMail({
      to: user.email,
      subject: input.title + ' — ' + settings.name,
      text: renderText(letter),
      html: renderHtml(letter)
    })
    if (delivered) logger.info({ userId: input.userId, type: input.type }, 'notification email sent')
  } catch (err) {
    logger.error({ err, userId: input.userId, type: input.type }, 'notification email failed')
  }
}
