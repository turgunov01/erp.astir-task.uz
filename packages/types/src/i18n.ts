/**
 * Interface languages, shared by the API, the web app and the database enum
 * `Locale` (prisma/schema.prisma). Russian is the source language: every
 * message is written in Russian first and the others carry the same keys.
 */
export const LOCALES = ['ru', 'uz', 'en', 'tr'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ru'

/** The cookie the chosen language is kept in; read by the API too. */
export const LOCALE_COOKIE = 'astir_locale'

/**
 * BCP 47 tags for Intl (dates, numbers, money, plural rules).
 *
 * Uzbek is written in Latin script here, so the tag names the script; plain
 * `uz` would be ambiguous. English uses British conventions (day before
 * month, 24-hour clock), closer to the studio's other documents than the
 * American ones.
 */
export const INTL_TAG: Record<Locale, string> = {
  ru: 'ru-RU',
  uz: 'uz-Latn-UZ',
  en: 'en-GB',
  tr: 'tr-TR'
}

/** Each language named in itself, as a language picker lists it. */
export const LOCALE_NATIVE_NAME: Record<Locale, string> = {
  ru: 'Русский',
  uz: 'O‘zbekcha',
  en: 'English',
  tr: 'Türkçe'
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}
