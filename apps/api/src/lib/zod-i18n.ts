import { z } from 'zod'
import { currentLocale, t, type Locale } from '../i18n'

/**
 * Validation messages in the language of the request.
 *
 * zod calls the error map while parsing, i.e. inside the request, so the
 * language comes from the request context rather than from whoever built the
 * schema. Field-level details reach the forms as they are; the commonest
 * issues get plain sentences from common.validation, because zod's own locales
 * name JavaScript types ("expected string"), which means nothing to the
 * person filling the form. zod's locale for the language covers the long tail.
 *
 * A schema that needs its own sentence uses an error function, so it is
 * worded at parse time too:
 *   z.string().min(1, { error: () => t('production.tasks.titleRequired') })
 */
const ZOD_LOCALE = {
  ru: z.locales.ru().localeError,
  uz: z.locales.uz().localeError,
  en: z.locales.en().localeError,
  tr: z.locales.tr().localeError
} satisfies Record<Locale, unknown>

type Issue = Parameters<NonNullable<(typeof ZOD_LOCALE)['ru']>>[0]

function sizeMessage(issue: Issue): string | undefined {
  if (issue.code !== 'too_small' && issue.code !== 'too_big') return undefined
  const isMin = issue.code === 'too_small'
  const limit = Number(isMin ? issue.minimum : issue.maximum)
  if (issue.origin === 'string') {
    if (isMin && limit === 1) return t('common.validation.fillIn')
    return t(isMin ? 'common.validation.minLength' : 'common.validation.maxLength', { count: limit })
  }
  if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint') {
    return t(isMin ? 'common.validation.minValue' : 'common.validation.maxValue', { limit })
  }
  if (issue.origin === 'array' || issue.origin === 'set') {
    return t(isMin ? 'common.validation.minItems' : 'common.validation.maxItems', { limit })
  }
  return undefined
}

function formatMessage(format: string): string {
  if (format === 'email') return t('common.validation.invalidEmail')
  if (format === 'uuid' || format === 'guid') return t('common.validation.invalidId')
  if (format === 'url') return t('common.validation.invalidUrl')
  if (format === 'date' || format === 'datetime') return t('common.validation.invalidDate')
  return t('common.validation.invalidFormat')
}

export function installZodMessages() {
  z.config({
    localeError: (issue) => {
      if (issue.code === 'invalid_type') {
        return issue.input === undefined || issue.input === null
          ? t('common.validation.required')
          : t('common.validation.invalidFormat')
      }
      if (issue.code === 'invalid_value') return t('common.validation.chooseFromList')
      if (issue.code === 'invalid_format') return formatMessage(issue.format)
      return sizeMessage(issue) ?? ZOD_LOCALE[currentLocale()]?.(issue)
    }
  })
}

installZodMessages()
