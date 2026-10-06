import { z } from 'zod'

/**
 * Russian wording for every validation message the API sends back.
 *
 * Field-level details reach the forms as they are, and the interface is
 * Russian-only, so the schemas' default English must never surface. Zod's own
 * Russian locale covers the long tail; the commonest issues get plainer
 * sentences here, because the locale names JavaScript types ("ожидалось
 * string"), which means nothing to the person filling the form.
 */
const ruLocale = z.locales.ru().localeError

type Issue = Parameters<NonNullable<typeof ruLocale>>[0]

function plural(count: number | bigint, one: string, few: string, many: string) {
  const n = Math.abs(Number(count)) % 100
  const last = n % 10
  if (n > 10 && n < 20) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

function sizeMessage(issue: Issue): string | undefined {
  if (issue.code !== 'too_small' && issue.code !== 'too_big') return undefined
  const isMin = issue.code === 'too_small'
  const limit = isMin ? issue.minimum : issue.maximum
  if (issue.origin === 'string') {
    if (isMin && Number(limit) === 1) return 'Заполните поле'
    // Genitive after «не короче / не длиннее»: 1 символа, 2 символов, 21 символа.
    const unit = plural(limit as number, 'символа', 'символов', 'символов')
    return (isMin ? 'Не короче ' : 'Не длиннее ') + limit + ' ' + unit
  }
  if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint') {
    return (isMin ? 'Значение не меньше ' : 'Значение не больше ') + limit
  }
  if (issue.origin === 'array' || issue.origin === 'set') {
    return (isMin ? 'Выберите не меньше ' : 'Не больше ') + limit
  }
  return undefined
}

export function installRussianZodMessages() {
  z.config({
    localeError: (issue) => {
      if (issue.code === 'invalid_type') {
        return issue.input === undefined || issue.input === null
          ? 'Обязательное поле'
          : 'Неверный формат значения'
      }
      if (issue.code === 'invalid_value') return 'Выберите значение из списка'
      if (issue.code === 'invalid_format') {
        if (issue.format === 'email') return 'Неверный адрес почты'
        if (issue.format === 'uuid' || issue.format === 'guid') return 'Неверный идентификатор'
        if (issue.format === 'url') return 'Неверная ссылка'
        if (issue.format === 'date' || issue.format === 'datetime') return 'Неверная дата'
        return 'Неверный формат значения'
      }
      return sizeMessage(issue) ?? ruLocale?.(issue)
    }
  })
}

installRussianZodMessages()
