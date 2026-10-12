import { SYSTEM_COLOR_MODE_SCRIPT, googleFontsHref, themeCss } from '~/lib/theme'

/**
 * The studio appearance on <html>, for every page and every visitor.
 *
 * Everything goes through useHead, so the server renders the font link, the
 * variables and the dark class into the first response: no flash of the
 * default look before hydration, the sign-in page included. A save on the
 * settings page changes brand.appearance and the head follows at once.
 *
 * Called by app.vue and error.vue (the error page replaces app.vue).
 */
export function useAppearanceHead() {
  const brand = useBrand()
  const appearance = computed(() => brand.value.appearance)

  const fontHref = computed(() => googleFontsHref([appearance.value.font]))
  const css = computed(() => themeCss(appearance.value))
  const mode = computed(() => appearance.value.colorMode)

  useHead({
    htmlAttrs: {
      class: computed(() => (mode.value === 'dark' ? 'dark' : undefined))
    },
    link: computed(() => (fontHref.value
      ? [
          { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
          { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
          { rel: 'stylesheet', href: fontHref.value, key: 'astir-font' }
        ]
      : [])),
    style: computed(() => (css.value ? [{ key: 'astir-theme', innerHTML: css.value }] : [])),
    script: computed(() => (mode.value === 'system'
      ? [{ key: 'astir-color-mode', innerHTML: SYSTEM_COLOR_MODE_SCRIPT, tagPosition: 'head' as const }]
      : []))
  })
}
