import { LOCALES, LOCALE_COOKIE, LOCALE_NATIVE_NAME, type Locale } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

/** A year: the choice should outlive a session, not a browser reinstall. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Switching the interface language, and remembering the choice.
 *
 * The switch is instant — messages load, labels re-render, nothing reloads —
 * and data that the API words (errors, report labels) is fetched again in the
 * new language. Where the choice is kept depends on who makes it:
 *
 *   - a signed-in person: their account (PATCH /api/users/me) and the cookie,
 *     so the sign-in page greets them in it after they sign out;
 *   - the sign-in page: the cookie only;
 *   - `null` («Как в студии»): the account forgets its choice and the cookie
 *     is cleared, so the studio default applies.
 */
export function useAppLocale() {
  const { locale, setLocale } = useI18n()
  const auth = useAuthStore()
  const brand = useBrand()
  const cookie = useCookie<string | null>(LOCALE_COOKIE, {
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax',
    path: '/'
  })

  const busy = ref(false)
  const error = ref('')

  /** The four languages, each named in itself, as a picker lists them. */
  const options = LOCALES.map(code => ({ code, name: LOCALE_NATIVE_NAME[code] }))

  const current = computed(() => locale.value as Locale)

  async function show(code: Locale) {
    if (locale.value !== code) await setLocale(code)
    // Anything the API worded (messages, labels in reports) in the old language.
    await refreshNuxtData()
  }

  /**
   * The signed-in person's own choice; null goes back to the studio default.
   * Resolves to false when the account could not be updated (the screen has
   * switched anyway; `error` says why it will not stick).
   */
  async function choose(code: Locale | null): Promise<boolean> {
    busy.value = true
    error.value = ''
    cookie.value = code
    try {
      await show(code ?? brand.value.defaultLocale)
      if (!auth.isAuthenticated) return true
      await apiRequest('/api/users/me', { method: 'PATCH', body: { locale: code } })
      await auth.refresh()
      return true
    } catch (err) {
      error.value = apiErrorMessage(err, translate('shell.language.saveFailed'))
      return false
    } finally {
      busy.value = false
    }
  }

  /** The sign-in page, where nobody is known yet: the cookie only. */
  async function chooseAsGuest(code: Locale) {
    cookie.value = code
    await show(code)
  }

  return { options, current, busy, error, choose, chooseAsGuest }
}
