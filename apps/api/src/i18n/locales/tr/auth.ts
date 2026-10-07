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
  reset: {
    accepted: 'Bu adres sistemde kayıtlıysa, şifre sıfırlama bağlantısı içeren bir e-posta gönderdik.',
    linkInvalid: 'Şifre sıfırlama bağlantısı geçersiz veya zaten kullanılmış. Yeni bir bağlantı isteyin.',
    linkExpired: 'Bağlantının süresi doldu. Yeni bir bağlantı isteyin.',
    done: 'Şifreniz değiştirildi. Yeni şifrenizle giriş yapın.'
  },
  resetEmail: {
    subject: 'Şifre sıfırlama — {studio}',
    greeting: 'Merhaba {name},',
    title: 'Şifre sıfırlama',
    intro: '{studio} hesabınızın şifresini sıfırlama talebi aldık.',
    action: 'Şifreyi sıfırla',
    linkFallback: 'Düğme açılmazsa bu bağlantıyı tarayıcınızın adres çubuğuna kopyalayın:',
    validity: 'Bağlantı {minutes} dakika geçerlidir ve bir kez çalışır.',
    notYou: 'Şifre sıfırlama talebinde bulunmadıysanız bu e-postayı dikkate almayın: şifreniz değişmez.'
  },
  passwordChangedEmail: {
    subject: 'Şifreniz değiştirildi — {studio}',
    title: 'Şifreniz değiştirildi',
    body: '{studio} hesabınızın şifresi az önce e-postadaki bağlantıyla değiştirildi. Tüm açık oturumlar kapatıldı.',
    action: 'Giriş yap',
    notYou: 'Bunu siz yapmadıysanız şifrenizi hemen yeniden sıfırlayın ve stüdyo yöneticisine haber verin.'
  },
  account: {
    currentPasswordWrong: 'Mevcut şifre hatalı',
    passwordTooShort: 'Şifre 8 karakterden kısa',
    cannotChangeOwnRole: 'Kendi hesabınızın rolünü değiştiremezsiniz',
    cannotDisableSelf: 'Kendi hesabınızı devre dışı bırakamazsınız'
  }
} satisfies Messages<typeof ru>
