import { DEFAULT_LOCALE, INTL_TAG, isLocale, type Locale } from '@astir/types'

/**
 * Translation for code that is not a component: label maps, formatters,
 * composables. Components use `useI18n()` / `$t` directly.
 *
 * The vue-i18n instance is per request on the server, so it is looked up
 * through the current Nuxt app rather than kept in a module variable (which
 * would be shared between concurrent requests). Called while a component
 * renders, in a computed, an event handler or a plugin, it always resolves.
 *
 * Reading the locale inside `translate` is what makes a label reactive: a
 * template or computed that calls it re-renders when the language changes.
 */

interface I18nLike {
  locale: { value: string }
  t: (key: string, ...args: unknown[]) => string
  te: (key: string, locale?: string) => boolean
}

function i18n(): I18nLike | null {
  const app = tryUseNuxtApp()
  return (app?.$i18n as unknown as I18nLike | undefined) ?? null
}

/** The interface language right now; Russian outside an app context. */
export function currentLocale(): Locale {
  const value = i18n()?.locale.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/** BCP 47 tag for Intl formatting in the current language (ru-RU, uz-Latn-UZ, en-GB, tr-TR). */
export function intlTag(): string {
  return INTL_TAG[currentLocale()]
}

const intlDataCache = new Map<string, boolean>()

/**
 * Whether this runtime really carries calendar data for `tag`.
 *
 * Node renders Uzbek dates fine, but some Chromium builds ship without Uzbek
 * month names and print «2026 M10 31» instead; the formatters then fall back
 * to the month names in the catalogue, so a page never changes its dates
 * between the server render and hydration.
 */
export function hasIntlData(tag: string = intlTag()): boolean {
  const cached = intlDataCache.get(tag)
  if (cached !== undefined) return cached
  let ok = false
  try {
    const sample = new Intl.DateTimeFormat(tag, { month: 'short' }).format(new Date(2026, 9, 15))
    ok = !/^M\d+$/.test(sample.trim())
  } catch {
    ok = false
  }
  intlDataCache.set(tag, ok)
  return ok
}

/** Short month name from the catalogue, 0-based like Date#getMonth. */
export function monthShortName(monthIndex: number): string {
  return translate('common.monthShort.' + (monthIndex + 1))
}

/**
 * `t()` for non-component code.
 *
 *   translate('common.units.minutes', { m: 5 })    named placeholders
 *   translate('common.count.tasks', 3)             plural form for 3, {n} = 3
 *   translate('shell.bell.unread', { n }, n)       both
 */
export function translate(key: string, named?: Record<string, unknown> | number, plural?: number): string {
  const instance = i18n()
  if (!instance) return key
  if (typeof named === 'number') return instance.t(key, named)
  if (plural !== undefined) return instance.t(key, named ?? {}, plural)
  return named ? instance.t(key, named) : instance.t(key)
}

/** Whether a message exists, in the current language or the Russian fallback. */
export function hasMessage(key: string): boolean {
  const instance = i18n()
  if (!instance) return false
  return instance.te(key) || instance.te(key, DEFAULT_LOCALE)
}
