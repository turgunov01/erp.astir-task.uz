import type { Messages } from '../../types'
import type ru from '../ru/team'

export default {
  notifications: {
    deadline: 'muddat {date}',
    taskAssigned: 'Sizga vazifa biriktirildi: {title}',
    projectAssigned: 'Siz loyihaga qo‘shildingiz: {name}',
    commentMention: 'Sizni muhokamada eslatishdi',
    renderFailed: 'Render xato bilan tugadi: {code}',
    versionApproved: 'Versiya kelishildi: {label}',
    changesRequested: 'Tuzatishlar so‘raldi: {label}',
    versionRejected: 'Versiya rad etildi: {label}',
    revisionCreated: 'Yangi tuzatish: {title}',
    revisionAssigned: 'Sizga tuzatish biriktirildi: {title}',
    revisionRound: '{code} · {round}-raund',
    versionSubmitted: 'Kelishuvga: {label}',
    overdueEdited: 'Muddati o‘tgan vazifa tahrirlandi: {title}',
    overdueEditedBody: '{days} kun kechikish · {change}',
    overdueReason: 'sabab: {reason}'
  },
  email: {
    greeting: 'Assalomu alaykum.',
    greetingNamed: 'Assalomu alaykum, {name}.',
    open: 'Ochish',
    openTask: 'Vazifani ochish',
    openProject: 'Loyihani ochish',
    unsubscribeText: 'Bunday xatlarni profilda o‘chirib qo‘yish mumkin: {link}',
    unsubscribeLink: 'bunday xatlarni profilda o‘chirish'
  },
  settings: {
    workDayEndBeforeStart: 'Ish kunining oxiri boshlanishidan keyin bo‘lishi kerak',
    pickWorkday: 'Kamida bitta ish kunini tanlang',
    noEmail: 'Joriy hisobda pochta yo‘q',
    mailTestSubject: '{studio} — pochtani tekshirish',
    mailTestBody: 'Agar siz bu xatni o‘qiyotgan bo‘lsangiz, {studio} dan pochta yuborish to‘g‘ri sozlangan.',
    mailTestSent: 'Xat {email} manziliga yuborildi',
    mailTestLogged: 'SMTP sozlanmagan — xat yuborilmadi, server jurnaliga yozildi',
    templateNeedsStage: 'Kamida bitta bosqich kerak'
  }
} satisfies Messages<typeof ru>
