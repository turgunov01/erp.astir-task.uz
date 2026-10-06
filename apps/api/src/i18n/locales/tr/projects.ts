import type { Messages } from '../../types'
import type ru from '../ru/projects'

export default {
  leadRole: {
    projectManager: 'Proje yöneticisi',
    producer: 'Yapımcı'
  },
  codeTaken: '{code} proje kodu zaten kullanılıyor',
  confirmDeleteCode: 'Geri alınamaz silme işlemini onaylamak için proje kodunu girin',
  members: {
    accountDisabled: 'Bu hesap devre dışı',
    alreadyMember: 'Bu kişi zaten proje ekibinde',
    hasOpenTasks: 'Bu kişinin hâlâ açık görevleri var: {count}. Önce onları başkasına atayın.'
  },
  clients: {
    hasActiveProjects: 'Müşterinin aktif projeleri var: {count}. Önce onları tamamlayın veya başkasına aktarın.'
  },
  files: {
    notReceived: 'Dosya alınmadı',
    typeNotAllowed: 'Bu dosya türü yüklenemez: {type}',
    unknownTarget: 'Dosyanın neye ekleneceği bilinmiyor: {target}',
    targetRequired: 'Dosyayı bir kayda, projeye veya müşteriye ekleyin'
  },
  dashboard: {
    phase: {
      preProduction: 'Ön prodüksiyon',
      production: 'Prodüksiyon',
      postProduction: 'Post prodüksiyon',
      review: 'Onay',
      delivery: 'Teslim'
    }
  }
} satisfies Messages<typeof ru>
