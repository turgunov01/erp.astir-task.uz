import { CATALOG, type MessageKey } from './catalog'
import { DEFAULT_LOCALE, INTL_TAG, isLocale, type Locale } from './locales'
import type { MessageParams } from './types'
import { requestContext } from '../lib/request-context'
import { cachedStudioSettings, studioSettings } from '../lib/settings'

export { LOCALES, DEFAULT_LOCALE, INTL_TAG, LOCALE_COOKIE, isLocale, localeFromAcceptLanguage } from './locales'
export type { Locale } from './locales'
export type { MessageKey } from './catalog'
export type { MessageParams } from './types'

/**
 * Server-side translation.
 *
 * `t(key, params)` answers in the language of the current request:
 *   1. the signed-in user's own choice (User.locale),
 *   2. the `astir_locale` cookie, then Accept-Language (sign-in page, guests),
 *   3. the studio default (StudioSettings.defaultLocale),
 *   4. Russian.
 *
 * Code that runs outside a request (a letter, a scheduled job) must not
 * guess: it resolves the recipient's language with `recipientLocale()` and
 * calls `tFor(locale, key, params)`.
 *
 * Usage, the one pattern for every user-facing message:
 *   throw badRequest(t('finance.vatTooLarge'))
 *   throw conflict(t('projects.codeTaken', { code }))
 */

/** Studio default without a database round trip (the settings row is cached). */
function studioDefaultLocale(): Locale {
  const value = cachedStudioSettings()?.defaultLocale
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/** The language of the request being handled, or the studio default outside one. */
export function currentLocale(): Locale {
  const context = requestContext()
  return context?.user.locale ?? context?.requestLocale ?? studioDefaultLocale()
}

/** A person's language: their own choice, else the studio default. */
export async function recipientLocale(userLocale: string | null | undefined): Promise<Locale> {
  if (isLocale(userLocale)) return userLocale
  const settings = await studioSettings()
  return isLocale(settings.defaultLocale) ? settings.defaultLocale : DEFAULT_LOCALE
}

function lookup(locale: Locale, key: string): string | undefined {
  let node: unknown = CATALOG[locale]
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * Plural form index by CLDR category, in the order the forms are written:
 * Russian `one | few | many`, the others `one | other` (Uzbek and Turkish
 * nouns do not change after a number, so they usually write a single form).
 */
const PLURAL_ORDER: Record<Locale, string[]> = {
  ru: ['one', 'few', 'many', 'other'],
  uz: ['one', 'other'],
  en: ['one', 'other'],
  tr: ['one', 'other']
}

const pluralRules = new Map<Locale, Intl.PluralRules>()

function pluralForm(locale: Locale, message: string, count: number): string {
  const forms = message.split(' | ')
  if (forms.length === 1) return message
  let rules = pluralRules.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(INTL_TAG[locale])
    pluralRules.set(locale, rules)
  }
  const index = PLURAL_ORDER[locale].indexOf(rules.select(count))
  const safe = index < 0 ? forms.length - 1 : Math.min(index, forms.length - 1)
  return forms[safe] ?? message
}

function interpolate(message: string, params: MessageParams | undefined): string {
  if (!params) return message
  return message.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined || value === null ? match : String(value)
  })
}

/** Translate into a given language. A missing key falls back to Russian, then to the key itself. */
export function tFor(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const raw = lookup(locale, key) ?? lookup(DEFAULT_LOCALE, key) ?? key
  const count = params?.count
  const chosen = typeof count === 'number' ? pluralForm(locale, raw, count) : raw
  return interpolate(chosen, params)
}

/** Translate into the language of the current request. */
export function t(key: MessageKey, params?: MessageParams): string {
  return tFor(currentLocale(), key, params)
}

/**
 * A translator bound to one language, for code that renders for someone else.
 * It carries its language so dates and numbers can be formatted to match.
 */
export type Translator = ((key: MessageKey, params?: MessageParams) => string) & {
  readonly locale: Locale
}

export function translatorFor(locale: Locale): Translator {
  const translate = (key: MessageKey, params?: MessageParams) => tFor(locale, key, params)
  return Object.assign(translate, { locale })
}

/**
 * Text that is worded when it is shown, not when it is created.
 *
 * Notifications are written for their recipient, whose language is only known
 * once the row is about to be stored, so callers hand over a function of the
 * translator instead of a finished sentence. A plain string (user data, or a
 * message that has no translation yet) passes through unchanged.
 */
export type LocalizedText = string | ((t: Translator) => string)

export function renderText(text: LocalizedText, translate: Translator): string {
  return typeof text === 'function' ? text(translate) : text
}

/**
 * Message keys inside shared schemas (packages/validation).
 *
 * That package cannot import this module, so its custom messages are written
 * as `i18n:common.validation.passwordsMismatch` and translated here, when the
 * error envelope is built.
 */
export const I18N_KEY_PREFIX = 'i18n:'

export function translateMaybeKey(message: string): string {
  return message.startsWith(I18N_KEY_PREFIX)
    ? t(message.slice(I18N_KEY_PREFIX.length) as MessageKey)
    : message
}

/** Dates in letters and exports, in the reader's conventions. */
export function formatDateFor(locale: Locale, date: Date): string {
  return date.toLocaleDateString(INTL_TAG[locale])
}
