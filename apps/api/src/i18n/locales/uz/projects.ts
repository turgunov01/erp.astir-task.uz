import type { Messages } from '../../types'
import type ru from '../ru/projects'

export default {
  leadRole: {
    projectManager: 'Loyiha menejeri',
    producer: 'Prodyuser'
  },
  codeTaken: '{code} loyiha kodi allaqachon band',
  confirmDeleteCode: 'Qaytarib bo‘lmaydigan o‘chirishni tasdiqlash uchun loyiha kodini kiriting',
  members: {
    accountDisabled: 'Bu hisob o‘chirilgan',
    alreadyMember: 'Bu odam allaqachon loyiha jamoasida',
    hasOpenTasks: 'Bu odamda hali ochiq vazifalar bor: {count}. Avval ularni boshqaga biriktiring.'
  },
  clients: {
    hasActiveProjects: 'Mijozda faol loyihalar bor: {count}. Avval ularni yakunlang yoki boshqaga o‘tkazing.'
  },
  files: {
    notReceived: 'Fayl olinmadi',
    typeNotAllowed: 'Bu turdagi faylni yuklab bo‘lmaydi: {type}',
    unknownTarget: 'Faylni nimaga biriktirish noma’lum: {target}',
    targetRequired: 'Faylni yozuvga, loyihaga yoki mijozga biriktiring'
  },
  dashboard: {
    phase: {
      preProduction: 'Preprodakshn',
      production: 'Prodakshn',
      postProduction: 'Postprodakshn',
      review: 'Kelishuv',
      delivery: 'Topshirish'
    }
  }
} satisfies Messages<typeof ru>
