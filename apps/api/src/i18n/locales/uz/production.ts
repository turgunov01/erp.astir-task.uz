import type { Messages } from '../../types'
import type ru from '../ru/production'

export default {
  tasks: {
    statusChange: 'holat {change}',
    noChanges: 'o‘zgarishsiz',
    overdueEditReason: 'Vazifa muddati o‘tgan. Tahrir sababini ko‘rsating — u ma’muriyatga yuboriladi.',
    overdueEditReasonField: 'Muddati o‘tgan vazifani tahrirlash sababini ko‘rsating',
    overdueMoveReason: 'Vazifa muddati o‘tgan. Ko‘chirish sababini ko‘rsating — u ma’muriyatga yuboriladi.',
    overdueMoveReasonField: 'Sababini ko‘rsating',
    prerequisitesUnfinished: 'Avval oldingi vazifalarni tugatish kerak: {tasks}',
    selfDependency: 'Vazifa o‘ziga o‘zi bog‘liq bo‘la olmaydi',
    crossProjectDependency: 'Bog‘liqliklar faqat bitta loyiha ichida bo‘lishi mumkin',
    reverseDependency: 'U vazifa allaqachon bu vazifaga bog‘liq',
    alreadyArchived: 'Vazifa allaqachon arxivda',
    notArchived: 'Vazifa arxivda emas',
    overdueComment: 'Muddati o‘tgan vazifa tahrirlandi ({days} kun): {reason}',
    fields: {
      title: 'nomi',
      description: 'tavsif',
      status: 'holat',
      priority: 'ustuvorlik',
      assigneeId: 'ijrochi',
      reviewerId: 'tekshiruvchi',
      episodeId: 'epizod',
      sceneId: 'sahna',
      shotId: 'shot',
      stageId: 'bosqich',
      estimatedHours: 'rejadagi soatlar',
      actualHours: 'haqiqiy soatlar',
      startDate: 'boshlanish sanasi',
      deadline: 'muddat'
    }
  },
  comments: {
    editOwnOnly: 'Faqat o‘z izohingizni tahrirlash mumkin',
    deleteOwnOnly: 'Faqat o‘z izohingizni o‘chirish mumkin'
  },
  reviews: {
    alreadyClosed: 'Bu kelishuv allaqachon yakunlangan',
    revisionTitle: '{target} bo‘yicha tuzatishlar',
    clientReviewByClient: 'Mijoz kelishuvini mijozning o‘zi yopadi',
    internalNotForClient: 'Ichki kelishuv mijoz uchun mavjud emas'
  },
  versions: {
    alreadySubmitted: 'Bu versiya allaqachon kelishuvga yuborilgan',
    approvedDeleteByProduction: 'Kelishilgan versiyani faqat prodakshn o‘chira oladi',
    projectIdRequired: 'Loyihani ko‘rsating (projectId)',
    fileTypeNotAllowed: '{type} fayl turiga ruxsat berilmagan'
  },
  episodes: {
    duplicate: '{number}-epizod bu loyihada allaqachon bor',
    hasScenes: 'Epizodda hali sahnalar bor: {count}. Avval ularni o‘chiring.'
  },
  scenes: {
    otherProjectEpisode: 'Bu epizod boshqa loyihaga tegishli',
    duplicate: '{number}-sahna bu yerda allaqachon bor',
    hasShots: 'Sahnada hali shotlar bor: {count}. Avval ularni o‘chiring.'
  },
  shots: {
    duplicate: '{code} shoti bu loyihada allaqachon bor'
  },
  stages: {
    hasTasks: 'Bosqichga hali vazifalar bog‘langan: {count}.'
  },
  assets: {
    hasVersions: 'Assetda hali versiyalar bor: {count}. Avval ularni o‘chiring.'
  },
  uploads: {
    typeUnsupported: '{type} fayl turi qo‘llab-quvvatlanmaydi',
    tooManyOpen: 'Tugallanmagan yuklashlar juda ko‘p. Ularni yakunlang yoki bekor qiling.',
    chunkOutOfRange: 'Qism raqami diapazondan tashqarida: {index} / {total}',
    chunkWrongSize: '{index}-qism {actual} emas, {expected} bayt bo‘lishi kerak',
    chunksMissing: 'Faylning hamma qismlari olinmadi',
    chunkTooBig: 'Fayl qismi e’lon qilingan hajmdan katta',
    chunkIncomplete: '{index}-qism to‘liq emas: {expected} baytdan {received} bayt olindi',
    completing: 'Yuklash allaqachon yakunlanmoqda'
  }
} satisfies Messages<typeof ru>
