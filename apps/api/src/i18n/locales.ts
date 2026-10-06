import { isLocale, type Locale } from '@astir/types'

/**
 * The language codes and Intl tags live in @astir/types so the web app, the
 * API and the database enum agree; this file adds what only the server needs.
 */
export { LOCALES, DEFAULT_LOCALE, INTL_TAG, LOCALE_COOKIE, isLocale } from '@astir/types'
export type { Locale } from '@astir/types'

/**
 * First supported language in an Accept-Language header.
 *
 * Only the primary subtag matters (`uz-Latn-UZ` → `uz`); quality weights are
 * honoured, so `en;q=0.1, tr` picks Turkish.
 */
export function localeFromAcceptLanguage(header: string | undefined): Locale | null {
  if (!header) return null
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
      return { code: tag.trim().toLowerCase().split('-')[0] ?? '', q: q ? Number(q.slice(2)) : 1, index }
    })
    .filter(entry => entry.code && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q || a.index - b.index)
  const hit = ranked.find(entry => isLocale(entry.code))
  return hit ? (hit.code as Locale) : null
}
