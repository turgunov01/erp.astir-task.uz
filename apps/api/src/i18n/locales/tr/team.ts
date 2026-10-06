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
    templateNeedsStage: 'En az bir aşama gerekli'
  }
} satisfies Messages<typeof ru>
