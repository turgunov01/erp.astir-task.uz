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
    templateNeedsStage: 'Kamida bitta bosqich kerak',
    selfLockout: 'O‘z rolingizni sozlamalar va huquqlarni boshqarishdan mahrum qilib bo‘lmaydi',
    beyondOwnRole: 'Rolingizda yo‘q huquqlarni berib bo‘lmaydi: {permissions}',
    beyondRoleCeiling: 'Bu rolga quyidagilarni berib bo‘lmaydi: {permissions}',
    noEmailForType: 'Bu turdagi bildirishnomalar uchun xat yuborilmaydi'
  },
  employees: {
    emailTaken: '{email} pochtali foydalanuvchi allaqachon mavjud',
    cannotDeleteSelf: 'O‘z hisobingizni o‘chirib bo‘lmaydi',
    ownLoginHere: 'O‘z hisobingizning pochtasi va paroli bu yerda o‘zgartirilmaydi — parol profilda o‘zgartiriladi',
    loginOutranked: 'Pochta va parolni faqat sizdan yuqori rolda bo‘lmaganlar uchun o‘zgartirish mumkin'
  },
  departments: {
    hasEmployees: 'Bo‘limda hali xodimlar bor: {count}. Avval ularni boshqa bo‘limga o‘tkazing.'
  },
  timesheets: {
    noEmployee: 'Hisobingiz xodimga bog‘lanmagan, shuning uchun soatlarni yozib bo‘lmaydi',
    ownOnly: 'Faqat o‘z tabel yozuvlaringizni o‘zgartirish mumkin'
  },
  attendance: {
    dayNotYet: 'Bu kun hali kelmagan',
    futureDayCorrection: 'Hali kelmagan kunni tuzatib bo‘lmaydi',
    checkInRequired: 'Kelish vaqtini ko‘rsating — usiz ketish vaqti hech narsani anglatmaydi',
    checkOutAfterCheckIn: 'Ketish vaqti kelishdan keyin bo‘lishi kerak',
    notCorrected: 'Bu kun qo‘lda tuzatilmagan',
    correctionReason: 'Tuzatish sababini yozing',
    staffOnly: 'Kelishni belgilash faqat studiya xodimlari uchun',
    correctedByAdmin: 'Bu kunni administrator allaqachon tuzatgan — belgilash shart emas',
    checkInFirst: 'Avval kelishingizni belgilang — «Keldim» tugmasini bosing',
    checkOutByAdmin: 'Bu kunni administrator tuzatgan — ketish vaqtini u kiritadi',
    penaltyRateMissing: 'Kechikish jarimasi stavkasi belgilanmagan. Uni Sozlamalar → Ish jadvali bo‘limida ko‘rsating.',
    penaltyReason: '{minutes} daqiqa kechikish: ish {start} da boshlanganda {arrival} da kelgan',
    penaltyMarked: '(davomat)',
    penaltyUnmarked: '(«Keldim» belgisiz — birinchi faollik bo‘yicha)'
  }
} satisfies Messages<typeof ru>
