import type { Messages } from '../../types'
import type ru from '../ru/auth'

export default {
  verifyEmailSent: 'Pochtani tasdiqlang: kod {email} manziliga yuborildi',
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
    notYou: 'Agar kirishni siz amalga oshirmagan bo‘lsangiz, studiya administratoriga xabar bering.'
  },
  account: {
    currentPasswordWrong: 'Joriy parol noto‘g‘ri',
    passwordTooShort: 'Parol 8 belgidan qisqa',
    cannotChangeOwnRole: 'O‘z hisobingiz rolini o‘zgartirib bo‘lmaydi',
    cannotDisableSelf: 'O‘z hisobingizni o‘chirib bo‘lmaydi'
  }
} satisfies Messages<typeof ru>
