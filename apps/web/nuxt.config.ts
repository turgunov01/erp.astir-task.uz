import tailwindcss from '@tailwindcss/vite'

const API_ORIGIN = process.env.NUXT_API_ORIGIN || 'http://127.0.0.1:4000'

/**
 * Message files per language, split by area so several people (or agents)
 * can translate different parts of the app without touching the same file.
 * See i18n/README.md.
 */
const I18N_NAMESPACES = ['common', 'shell', 'auth', 'production', 'projects', 'finance', 'team']
const localeFiles = (code: string) => I18N_NAMESPACES.map(name => code + '/' + name + '.json')

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['shadcn-nuxt', '@pinia/nuxt', '@vueuse/nuxt', '@nuxt/icon', '@nuxtjs/i18n'],

  devtools: { enabled: true },

  /*
   * Interface languages. No URL prefixes: the language is a person's
   * preference, not part of an address, so a link means the same page for
   * everyone. app/plugins/locale.ts picks it — the signed-in user's choice,
   * then the astir_locale cookie, then the studio default, then Russian — and
   * <html lang> follows it (layouts and error.vue set it through useHead).
   * Messages are loaded per language on demand.
   */
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'ru',
    langDir: 'locales',
    locales: [
      { code: 'ru', language: 'ru-RU', name: 'Русский', files: localeFiles('ru') },
      { code: 'uz', language: 'uz-Latn-UZ', name: 'O‘zbekcha', files: localeFiles('uz') },
      { code: 'en', language: 'en-GB', name: 'English', files: localeFiles('en') },
      { code: 'tr', language: 'tr-TR', name: 'Türkçe', files: localeFiles('tr') }
    ],
    /*
     * Off on purpose: the module would otherwise follow the browser's language
     * and write its guess into the cookie, which would then outrank the studio
     * default. The astir_locale cookie holds explicit choices only, written by
     * useAppLocale().
     */
    detectBrowserLanguage: false
  },

  css: ['~/assets/css/tailwind.css'],

  // Порт закреплён: dev-сервер всегда поднимается на 9990.
  devServer: {
    port: 9990,
    host: '127.0.0.1'
  },

  // Иконки без обращения к api.iconify.design:
  //  - serverBundle: 'local' — берём из установленных @iconify-json/* пакетов;
  //  - clientBundle.scan     — иконки из исходников встраиваются в клиентский бандл.
  icon: {
    // Moved off /api because the /api/** proxy rule below forwards that
    // prefix to the Express API, which would swallow the icon endpoint.
    localApiEndpoint: '/_nuxt_icon',
    serverBundle: 'local',
    clientBundle: {
      scan: true,
      includeCustomCollections: true
    }
  },

  shadcn: {
    prefix: '',
    componentDir: './app/components/ui'
  },

  // The API is proxied under the same origin so that httpOnly auth cookies are
  // sent on both client fetches and SSR requests without CORS or token juggling.
  routeRules: {
    '/api/**': { proxy: API_ORIGIN + '/api/**' },
    /*
     * Uploaded files are served by the API from disk, and their stored URL is
     * site-relative (/uploads/...). Without this rule the browser asks Nuxt for
     * them and every attached image renders as a broken link.
     */
    '/uploads/**': { proxy: API_ORIGIN + '/uploads/**' },
    // A short address for the attendance board, easy to say and to type.
    '/attendance': { redirect: '/team/attendance' }
  },

  // Every hashed asset is written with .gz and .br siblings at build time, so
  // nginx (gzip_static) hands out compressed files without touching Node.
  nitro: {
    compressPublicAssets: true
  },

  runtimeConfig: {
    apiOrigin: API_ORIGIN,
    public: {
      apiBase: '/api'
    }
  },

  vite: {
    plugins: [tailwindcss()]
  },

  compatibilityDate: '2026-06-30'
})
