// Пользовательская документация astir-erp на официальном шаблоне Docus
// (Nuxt UI + Nuxt Content). Отдельное приложение монорепо.
export default defineNuxtConfig({
  extends: ['docus'],
  site: {
    name: 'Astir ERP — документация'
  },
  llms: {
    domain: 'https://erp.astir-task.uz',
    title: 'Astir ERP — документация',
    description: 'Руководство пользователя Astir ERP'
  },
  compatibilityDate: '2025-07-15'
})
