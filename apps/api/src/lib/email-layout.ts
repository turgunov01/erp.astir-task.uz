import { env } from '../config/env'
import type { Locale } from '../i18n'

/**
 * The branded frame every HTML letter shares: studio name or logo on top,
 * greeting, title, paragraphs, an optional button, a footer line.
 *
 * Table layout and inline styles: the only HTML mail clients agree on. Every
 * value is escaped here, so callers pass plain text.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Links in a letter must be absolute; the app stores them relative. */
export function absoluteUrl(path: string): string {
  return new URL(path, env.APP_URL).href
}

/** A logo only if it can load from a mail client, i.e. an absolute http(s) URL. */
export function publicLogo(logoUrl: string | null): string | null {
  return logoUrl && /^https?:\/\//i.test(logoUrl) ? logoUrl : null
}

export interface LetterFrame {
  locale: Locale
  studio: string
  logoUrl: string | null
  greeting: string
  title: string
  paragraphs: readonly string[]
  action?: { label: string, url: string }
  /** Small print under the button, e.g. "if you did not ask for this". */
  notes?: readonly string[]
  /** Optional footer link after the studio name. */
  footerLink?: { label: string, url: string }
}

function brandRow(frame: LetterFrame, studio: string): string {
  return frame.logoUrl
    ? '<img src="' + escapeHtml(frame.logoUrl) + '" alt="' + studio + '" height="28" style="display:block;height:28px;border:0">'
    : '<span style="font-size:15px;font-weight:600;color:#111827">' + studio + '</span>'
}

function paragraphRows(paragraphs: readonly string[]): string {
  return paragraphs
    .map(text => '<tr><td style="padding-top:6px;font-size:14px;line-height:20px;color:#4b5563">' + escapeHtml(text) + '</td></tr>')
    .join('')
}

function actionRow(action: LetterFrame['action']): string {
  if (!action) return ''
  return '<tr><td style="padding:20px 0 4px">' +
    '<a href="' + escapeHtml(action.url) + '" style="display:inline-block;background:#111827;color:#ffffff;' +
    'text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:8px">' +
    escapeHtml(action.label) + '</a></td></tr>'
}

function noteRows(notes: readonly string[] | undefined): string {
  return (notes ?? [])
    .map(text => '<tr><td style="padding-top:12px;font-size:12px;line-height:18px;color:#6b7280">' + escapeHtml(text) + '</td></tr>')
    .join('')
}

function footerRow(frame: LetterFrame, studio: string): string {
  const link = frame.footerLink
    ? ' · <a href="' + escapeHtml(frame.footerLink.url) + '" style="color:#6b7280">' + escapeHtml(frame.footerLink.label) + '</a>'
    : ''
  return '<tr><td style="padding:16px 24px;border-top:1px solid #f0f0f1;font-size:12px;line-height:18px;color:#9ca3af">' +
    studio + link + '</td></tr>'
}

export function renderLetterHtml(frame: LetterFrame): string {
  const studio = escapeHtml(frame.studio)
  return '<!doctype html><html lang="' + frame.locale + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(frame.title) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px">' +
    '<tr><td style="padding:20px 24px;border-bottom:1px solid #f0f0f1">' + brandRow(frame, studio) + '</td></tr>' +
    '<tr><td style="padding:24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">' +
    '<tr><td style="padding-bottom:12px;font-size:14px;color:#4b5563">' + escapeHtml(frame.greeting) + '</td></tr>' +
    '<tr><td style="font-size:17px;line-height:24px;font-weight:600;color:#111827">' + escapeHtml(frame.title) + '</td></tr>' +
    paragraphRows(frame.paragraphs) + actionRow(frame.action) + noteRows(frame.notes) +
    '</table></td></tr>' +
    footerRow(frame, studio) +
    '</table></td></tr></table></body></html>'
}
