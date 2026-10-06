import { t as requestT, type MessageKey, type MessageParams } from '../i18n'
import type { Catalog } from '../i18n/catalog'

/**
 * Enum members as people read them in files they open (CSV exports) and in
 * letters. The words live in common.enum.<name>.<VALUE> — the same names the
 * web app uses — so an export reads like the screen in every language.
 */
export type EnumName = keyof Catalog['common']['enum']

/** `t` for the request, or a recipient's `translatorFor(locale)`. */
type Translate = (key: MessageKey, params?: MessageParams) => string

/**
 * One enum value, in the given translator's language (default: the request's).
 * Never the raw English member: an unknown value reads as «Не указано».
 */
export function enumLabel(
  name: EnumName,
  value: string | null | undefined,
  translate: Translate = requestT
): string {
  if (!value) return ''
  const key = ('common.enum.' + name + '.' + value) as MessageKey
  const text = translate(key)
  return text === key ? translate('common.unknownValue') : text
}

/** «В работе» → «На проверке», as a status move reads in comments and letters. */
export function taskStatusChange(translate: Translate, from: string, to: string): string {
  return translate('common.statusChange', {
    from: enumLabel('taskStatus', from, translate),
    to: enumLabel('taskStatus', to, translate)
  })
}
