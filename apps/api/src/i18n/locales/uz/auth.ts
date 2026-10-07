import type { Messages } from '../../types'
import type ru from '../ru/auth'

export default {
  verifyEmailSent: 'Pochtani tasdiqlang: kod {email} manziliga yuborildi',
  verifyChangedEmailSent: 'Kirish manzili o‘zgartirildi. Yangi pochtani tasdiqlang: kod {email} manziliga yuborildi',
  code: {
    notRequested: 'Kod so‘ralmagan yoki allaqachon ishlatilgan',
    expired: 'Kodning amal qilish muddati tugadi, yangisini so‘rang',
    tooManyAttempts: 'Urinishlar juda ko‘p, yangi kod so‘rang',
    wrong: 'Kod noto‘g‘ri'
  },
  codeEmail: {
    subject: 'Pochtani tasdiqlash — {studio}',
    greeting: 'Assalomu alaykum, {name}.',
    yourCode: 'Pochtani tasdiqlash kodingiz: {code}',
    whereToEnter: 'Uni {studio} kirish sahifasida paroldan so‘ng darhol kiriting:',
    validity: 'Kod faqat birinchi kirishda kerak bo‘ladi, {minutes} daqiqa amal qiladi va bir marta kiritiladi.',
    validityOnce: 'Kod {minutes} daqiqa amal qiladi va bir marta kiritiladi.',
    emailChanged: '{studio} administratori hisobingizga kirish manzilini shu pochtaga o‘zgartirdi. Uni kod bilan tasdiqlang — bundan buyon shu manzil bilan kirasiz.',
    notYou: 'Agar kirishni siz amalga oshirmagan bo‘lsangiz, studiya administratoriga xabar bering.'
  },
  reset: {
    accepted: 'Agar bunday manzil tizimda bo‘lsa, unga parolni tiklash havolasi bilan xat yubordik.',
    linkInvalid: 'Parolni tiklash havolasi yaroqsiz yoki allaqachon ishlatilgan. Yangisini so‘rang.',
    linkExpired: 'Havolaning amal qilish muddati tugadi. Yangisini so‘rang.',
    done: 'Parol o‘zgartirildi. Yangi parol bilan kiring.'
  },
  resetEmail: {
    subject: 'Parolni tiklash — {studio}',
    greeting: 'Assalomu alaykum, {name}.',
    title: 'Parolni tiklash',
    intro: '{studio} dagi hisobingiz parolini tiklash so‘rovini oldik.',
    action: 'Parolni tiklash',
    linkFallback: 'Agar tugma ochilmasa, havolani brauzerning manzil satriga nusxalang:',
    validity: 'Havola {minutes} daqiqa amal qiladi va bir marta ishlaydi.',
    notYou: 'Agar parolni tiklashni so‘ramagan bo‘lsangiz, bu xatga e’tibor bermang: parolingiz o‘zgarmaydi.'
  },
  passwordChangedEmail: {
    subject: 'Parolingiz o‘zgartirildi — {studio}',
    title: 'Parolingiz o‘zgartirildi',
    body: '{studio} dagi hisobingiz paroli hozirgina xatdagi havola orqali o‘zgartirildi. Barcha ochiq seanslar yakunlandi.',
    action: 'Kirish',
    notYou: 'Agar buni siz qilmagan bo‘lsangiz, darhol parolni yana tiklang va studiya administratoriga xabar bering.'
  },
  /** A manager moved the login to another address. */
  loginEmailChangedEmail: {
    subject: 'Kirish manzili o‘zgartirildi — {studio}',
    title: 'Kirish manzili o‘zgartirildi',
    body: '{studio} administratori hisobingizga kirish manzilini {email} ga o‘zgartirdi. Endi yangi manzil bilan kiring: birinchi kirishda uni xatdagi kod bilan tasdiqlashni so‘raymiz. Barcha ochiq seanslar yakunlandi.',
    action: 'Kirish',
    notYou: 'Agar bu o‘zgarishni kutmagan bo‘lsangiz, darhol studiya administratoriga murojaat qiling.'
  },
  /** A manager set a password the person must replace. */
  passwordSetEmail: {
    subject: 'Administrator sizga yangi parol o‘rnatdi — {studio}',
    title: 'Administratordan yangi parol',
    body: '{studio} administratori hisobingiz uchun yangi parol o‘rnatdi. Uni administratordan bilib oling: kirgandan so‘ng tizim uni darhol o‘z parolingizga almashtirishni so‘raydi. Barcha ochiq seanslar yakunlandi.',
    action: 'Kirish',
    notYou: 'Agar bu o‘zgarishni kutmagan bo‘lsangiz, darhol studiya administratoriga murojaat qiling.'
  },
  account: {
    currentPasswordWrong: 'Joriy parol noto‘g‘ri',
    passwordTooShort: 'Parol 8 belgidan qisqa',
    cannotChangeOwnRole: 'O‘z hisobingiz rolini o‘zgartirib bo‘lmaydi',
    cannotDisableSelf: 'O‘z hisobingizni o‘chirib bo‘lmaydi',
    passwordChangeRequired: 'Avval administrator bergan parol o‘rniga o‘z parolingizni o‘rnating',
    passwordChangeNotRequired: 'Hozir parolni almashtirish talab etilmaydi — parol profilda o‘zgartiriladi',
    sameAsIssued: 'Yangi parol administrator bergan paroldan farq qilishi kerak'
  }
} satisfies Messages<typeof ru>
