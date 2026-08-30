import tailwindcss from '@tailwindcss/vite'

const API_ORIGIN = process.env.NUXT_API_ORIGIN || 'http://127.0.0.1:4000'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['shadcn-nuxt', '@pinia/nuxt', '@vueuse/nuxt', '@nuxt/icon'],

  devtools: { enabled: true },

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
    '/uploads/**': { proxy: API_ORIGIN + '/uploads/**' }
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
