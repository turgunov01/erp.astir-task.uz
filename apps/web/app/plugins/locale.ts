import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from '@astir/types'
import { getCookie } from 'h3'
import type { $Fetch } from 'ofetch'
import type { Pinia } from 'pinia'
import { useAuthStore } from '~/stores/auth'
import type { Brand } from '~/composables/useBrand'

/**
 * Which language the interface is in, decided once per page load.
 *
 *   1. the signed-in user's own choice (User.locale),
 *   2. the astir_locale cookie — a choice made on the sign-in page, or the
 *      last personal choice on this browser,
 *   3. the studio default (Settings → «Язык по умолчанию»),
 *   4. Russian.
 *
 * The browser's own language is deliberately not consulted: the studio picks
 * the language its people work in. The server decides and the answer travels
 * in the payload, so the client starts in the same language and hydration
 * never mismatches. Later switches go through useAppLocale().
 *
 * Runs after @nuxtjs/i18n has set itself up, and resolves the session itself
 * (auth.init is idempotent; the route middleware then finds it done).
 */
export default defineNuxtPlugin({
  name: 'astir:locale',
  dependsOn: ['i18n:plugin:route-locale-detect'],
  async setup(nuxtApp) {
    const auth = useAuthStore(nuxtApp.$pinia as Pinia)
    const brand = useBrand()
    const resolved = useState<Locale | null>('astir:locale', () => null)

    if (import.meta.server) {
      const request = useRequestFetch()
      const [, brandAnswer] = await Promise.all([
        auth.init(),
        request<{ data: Omit<Brand, 'loaded'> }>('/api/settings/brand').catch(() => null)
      ])
      if (brandAnswer?.data) {
        brand.value = {
          name: brandAnswer.data.name,
          logoUrl: brandAnswer.data.logoUrl,
          defaultLocale: isLocale(brandAnswer.data.defaultLocale) ? brandAnswer.data.defaultLocale : DEFAULT_LOCALE,
          loaded: true
        }
      }
      // The cookie as the browser sent it, not as the i18n module rewrote it.
      const event = useRequestEvent()
      const cookie = event ? getCookie(event, LOCALE_COOKIE) : undefined
      const user = auth.user?.locale
      resolved.value = isLocale(user) ? user : isLocale(cookie) ? cookie : brand.value.defaultLocale
    }

    const target = resolved.value ?? DEFAULT_LOCALE
    const i18n = nuxtApp.$i18n
    if (i18n.locale.value !== target) await i18n.setLocale(target)

    // <html lang> follows the language: hyphenation, screen readers, spell check.
    nuxtApp.runWithContext(() => {
      useHead({ htmlAttrs: { lang: computed(() => i18n.locale.value) } })
    })

    /*
     * Every request from the browser carries the language, so the API words
     * its errors and exports the way the screen reads. The astir_locale cookie
     * already reaches the API through the same-origin proxy; the header covers
     * the period before a cookie exists (studio default) and anything that
     * strips cookies.
     */
    if (import.meta.client) {
      // Signing in on this page: the account's own language takes over at once.
      watch(() => auth.user?.locale, (code) => {
        if (isLocale(code) && code !== i18n.locale.value) void i18n.setLocale(code)
      })

      const base = globalThis.$fetch as $Fetch
      globalThis.$fetch = base.create({
        onRequest({ options }) {
          const headers = new Headers(options.headers as HeadersInit | undefined)
          if (!headers.has('accept-language')) headers.set('accept-language', i18n.locale.value)
          options.headers = headers
        }
      }) as typeof globalThis.$fetch
    }
  }
})
