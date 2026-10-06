import type { Messages } from '../../types'
import type ru from '../ru/auth'

export default {
  verifyEmailSent: 'E-postanızı doğrulayın: kod {email} adresine gönderildi',
  code: {
    notRequested: 'Kod istenmemiş veya zaten kullanılmış',
    expired: 'Kodun süresi doldu, yenisini isteyin',
    tooManyAttempts: 'Çok fazla deneme, yeni bir kod isteyin',
    wrong: 'Kod hatalı'
  },
  codeEmail: {
    subject: 'E-posta doğrulama — {studio}',
    greeting: 'Merhaba {name},',
    yourCode: 'E-posta doğrulama kodunuz: {code}',
    whereToEnter: 'Kodu {studio} giriş sayfasında şifrenizden hemen sonra girin:',
    validity: 'Kod yalnızca ilk girişte gereklidir, {minutes} dakika geçerlidir ve bir kez kullanılır.',
    notYou: 'Giriş yapan siz değilseniz stüdyo yöneticisine haber verin.'
  },
  account: {
    currentPasswordWrong: 'Mevcut şifre hatalı',
    passwordTooShort: 'Şifre 8 karakterden kısa',
    cannotChangeOwnRole: 'Kendi hesabınızın rolünü değiştiremezsiniz',
    cannotDisableSelf: 'Kendi hesabınızı devre dışı bırakamazsınız'
  }
} satisfies Messages<typeof ru>
