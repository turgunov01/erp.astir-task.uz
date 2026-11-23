export default defineAppConfig({
  docus: {
    locale: 'ru'
  },
  seo: {
    title: 'Astir ERP — документация',
    description: 'Руководство пользователя ERP-системы анимационной студии Astir'
  },
  // Репозиторий приватный: ссылки на GitHub в шапке и «Редактировать страницу» не нужны.
  github: false,
  header: {
    title: 'Astir ERP'
  },
  ui: {
    colors: {
      primary: 'emerald',
      neutral: 'zinc'
    }
  }
})
