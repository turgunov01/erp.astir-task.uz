import type { Messages } from '../../types'
import type ru from '../ru/production'

export default {
  tasks: {
    statusChange: 'durum {change}',
    noChanges: 'değişiklik yok',
    overdueEditReason: 'Görevin süresi geçti. Düzenleme nedenini belirtin — yönetime iletilecek.',
    overdueEditReasonField: 'Süresi geçmiş görevi düzenleme nedenini belirtin',
    overdueMoveReason: 'Görevin süresi geçti. Taşıma nedenini belirtin — yönetime iletilecek.',
    overdueMoveReasonField: 'Nedenini belirtin',
    prerequisitesUnfinished: 'Önce öncül görevlerin bitirilmesi gerekiyor: {tasks}',
    selfDependency: 'Bir görev kendisine bağlı olamaz',
    crossProjectDependency: 'Bağımlılıklar yalnızca aynı proje içinde olabilir',
    reverseDependency: 'O görev zaten bu göreve bağlı',
    alreadyArchived: 'Görev zaten arşivde',
    notArchived: 'Görev arşivde değil',
    overdueComment: 'Süresi geçmiş görev düzenlendi ({days} gün gecikme): {reason}',
    fields: {
      title: 'başlık',
      description: 'açıklama',
      status: 'durum',
      priority: 'öncelik',
      assigneeId: 'sorumlu',
      reviewerId: 'kontrol eden',
      episodeId: 'bölüm',
      sceneId: 'sahne',
      shotId: 'çekim',
      stageId: 'aşama',
      estimatedHours: 'tahmini saat',
      actualHours: 'gerçekleşen saat',
      startDate: 'başlangıç tarihi',
      deadline: 'son tarih'
    }
  },
  comments: {
    editOwnOnly: 'Yalnızca kendi yorumunuzu düzenleyebilirsiniz',
    deleteOwnOnly: 'Yalnızca kendi yorumunuzu silebilirsiniz'
  },
  reviews: {
    alreadyClosed: 'Bu onay süreci zaten tamamlandı',
    revisionTitle: '{target} için düzeltmeler',
    clientReviewByClient: 'Müşteri onayını müşterinin kendisi kapatır',
    internalNotForClient: 'Dahili onay süreci müşteriye açık değildir'
  },
  versions: {
    alreadySubmitted: 'Bu sürüm zaten onaya gönderildi',
    approvedDeleteByProduction: 'Onaylanmış bir sürümü yalnızca prodüksiyon silebilir',
    projectIdRequired: 'Projeyi belirtin (projectId)',
    fileTypeNotAllowed: '{type} dosya türüne izin verilmiyor'
  },
  episodes: {
    duplicate: '{number}. bölüm bu projede zaten var',
    hasScenes: 'Bölümde hâlâ sahneler var: {count}. Önce onları silin.'
  },
  scenes: {
    otherProjectEpisode: 'Bu bölüm başka bir projeye ait',
    duplicate: '{number}. sahne burada zaten var',
    hasShots: 'Sahnede hâlâ çekimler var: {count}. Önce onları silin.'
  },
  shots: {
    duplicate: '{code} çekimi bu projede zaten var'
  },
  stages: {
    hasTasks: 'Bu aşamaya hâlâ bağlı görevler var: {count}.'
  },
  assets: {
    hasVersions: 'Varlığın hâlâ sürümleri var: {count}. Önce onları silin.'
  },
  uploads: {
    typeUnsupported: '{type} dosya türü desteklenmiyor',
    tooManyOpen: 'Tamamlanmamış yükleme sayısı çok fazla. Bunları tamamlayın veya iptal edin.',
    chunkOutOfRange: 'Parça numarası aralık dışında: {index} / {total}',
    chunkWrongSize: '{index}. parça {actual} değil, {expected} bayt olmalı',
    chunksMissing: 'Dosyanın tüm parçaları alınmadı',
    chunkTooBig: 'Dosya parçası bildirilen boyuttan büyük',
    chunkIncomplete: '{index}. parça eksik: {expected} bayttan {received} bayt alındı',
    completing: 'Yükleme zaten tamamlanıyor'
  }
} satisfies Messages<typeof ru>
