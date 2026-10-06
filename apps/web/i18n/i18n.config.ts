import { INTL_TAG, type Locale } from '@astir/types'

/**
 * vue-i18n options (the module reads this file by its default name).
 *
 * Plural forms are written in the order Intl.PluralRules names them:
 * Russian `one | few | many` («1 задача | 2 задачи | 5 задач»), the others
 * `one | other`. Uzbek and Turkish nouns do not change after a number, so a
 * single form is fine there and is used as is.
 */
const PLURAL_ORDER: Record<Locale, string[]> = {
  ru: ['one', 'few', 'many', 'other'],
  uz: ['one', 'other'],
  en: ['one', 'other'],
  tr: ['one', 'other']
}

function pluralRule(locale: Locale) {
  const rules = new Intl.PluralRules(INTL_TAG[locale])
  return (choice: number, choicesLength: number) => {
    if (choicesLength <= 1) return 0
    const index = PLURAL_ORDER[locale].indexOf(rules.select(choice))
    return index < 0 ? choicesLength - 1 : Math.min(index, choicesLength - 1)
  }
}

export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'ru',
  // A key that only Russian has yet shows the Russian text, not a warning per render.
  missingWarn: false,
  fallbackWarn: false,
  pluralRules: {
    ru: pluralRule('ru'),
    uz: pluralRule('uz'),
    en: pluralRule('en'),
    tr: pluralRule('tr')
  }
}))
