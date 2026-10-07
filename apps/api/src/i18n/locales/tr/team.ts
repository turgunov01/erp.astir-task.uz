import type { Messages } from '../../types'
import type ru from '../ru/team'

export default {
  notifications: {
    deadline: 'son tarih {date}',
    taskAssigned: 'Size bir görev atandı: {title}',
    projectAssigned: 'Projeye eklendiniz: {name}',
    commentMention: 'Bir tartışmada sizden bahsedildi',
    renderFailed: 'Render başarısız oldu: {code}',
    versionApproved: 'Sürüm onaylandı: {label}',
    changesRequested: 'Düzeltme istendi: {label}',
    versionRejected: 'Sürüm reddedildi: {label}',
    revisionCreated: 'Yeni düzeltme: {title}',
    revisionAssigned: 'Size bir düzeltme atandı: {title}',
    revisionRound: '{code} · {round}. tur',
    versionSubmitted: 'Onaya gönderildi: {label}',
    overdueEdited: 'Gecikmiş görev düzenlendi: {title}',
    overdueEditedBody: '{days} gün gecikme · {change}',
    overdueReason: 'neden: {reason}'
  },
  email: {
    greeting: 'Merhaba,',
    greetingNamed: 'Merhaba {name},',
    open: 'Aç',
    openTask: 'Görevi aç',
    openProject: 'Projeyi aç',
    unsubscribeText: 'Bu e-postaları profilinizden kapatabilirsiniz: {link}',
    unsubscribeLink: 'bu e-postaları profilden kapat'
  },
  settings: {
    workDayEndBeforeStart: 'İş günü başladıktan sonra bitmeli',
    pickWorkday: 'En az bir iş günü seçin',
    noEmail: 'Mevcut hesabın e-posta adresi yok',
    mailTestSubject: '{studio} — e-posta testi',
    mailTestBody: 'Bu e-postayı okuyorsanız {studio} e-posta gönderimi doğru ayarlanmıştır.',
    mailTestSent: 'E-posta {email} adresine gönderildi',
    mailTestLogged: 'SMTP ayarlanmamış — e-posta gönderilmedi, sunucu günlüğüne yazıldı',
    templateNeedsStage: 'En az bir aşama gerekli',
    selfLockout: 'Kendi rolünüzün ayarlara ve yetki yönetimine erişimini kaldıramazsınız',
    beyondOwnRole: 'Kendi rolünüzde olmayan yetkileri veremezsiniz: {permissions}',
    beyondRoleCeiling: 'Bu role şunlar verilemez: {permissions}',
    noEmailForType: 'Bu tür bildirimler için e-posta gönderilmez'
  },
  employees: {
    emailTaken: '{email} e-posta adresine sahip bir kullanıcı zaten var',
    cannotDeleteSelf: 'Kendi hesabınızı silemezsiniz',
    ownLoginHere: 'Kendi hesabınızın e-postası ve şifresi burada değiştirilmez — şifrenizi profilden değiştirin',
    loginOutranked: 'E-posta ve şifreyi yalnızca sizden üst rolde olmayanlar için değiştirebilirsiniz'
  },
  departments: {
    hasEmployees: 'Departmanda hâlâ çalışanlar var: {count}. Önce onları başka bir departmana taşıyın.'
  },
  timesheets: {
    noEmployee: 'Hesabınız bir çalışana bağlı değil, bu yüzden saat kaydedilemez',
    ownOnly: 'Yalnızca kendi puantaj kayıtlarınızı değiştirebilirsiniz'
  },
  attendance: {
    dayNotYet: 'Bu gün henüz gelmedi',
    futureDayCorrection: 'Henüz gelmemiş bir gün düzeltilemez',
    checkInRequired: 'Geliş saatini belirtin — o olmadan çıkış saatinin anlamı yok',
    checkOutAfterCheckIn: 'Çıkış, gelişten sonra olmalı',
    notCorrected: 'Bu gün elle düzeltilmedi',
    correctionReason: 'Düzeltmenin nedenini yazın',
    staffOnly: 'Geliş bildirimi yalnızca stüdyo çalışanlarına açıktır',
    correctedByAdmin: 'Bu günü bir yönetici zaten düzeltti — bildirmenize gerek yok',
    checkInFirst: 'Önce gelişinizi bildirin — “Geldim” düğmesine basın',
    checkOutByAdmin: 'Bu günü bir yönetici düzeltti — çıkış saatini o girecek',
    penaltyRateMissing: 'Gecikme cezası oranı belirlenmemiş. Ayarlar → Çalışma takvimi bölümünden belirleyin.',
    penaltyReason: '{minutes} dk gecikme: iş {start} saatinde başlarken geliş {arrival}',
    penaltyMarked: '(devam kaydı)',
    penaltyUnmarked: '(“Geldim” bildirimi yok — ilk etkinliğe göre)'
  }
} satisfies Messages<typeof ru>
