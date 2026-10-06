/** Sign-in, sessions, the emailed first-login code and the user's own account. */
export default {
  verifyEmailSent: 'Подтвердите почту: код отправлен на {email}',
  code: {
    notRequested: 'Код не запрашивался или уже использован',
    expired: 'Срок действия кода истёк, запросите новый',
    tooManyAttempts: 'Слишком много попыток, запросите новый код',
    wrong: 'Неверный код'
  },
  /** The letter with the six-digit code. */
  codeEmail: {
    subject: 'Подтверждение почты — {studio}',
    greeting: '{name}, здравствуйте.',
    yourCode: 'Ваш код для подтверждения почты: {code}',
    whereToEnter: 'Введите его на странице входа в {studio} сразу после пароля:',
    validity: 'Код нужен только при первом входе, действует {minutes} минут и вводится один раз.',
    notYou: 'Если вход выполняли не вы — сообщите администратору студии.'
  },
  account: {
    currentPasswordWrong: 'Текущий пароль неверен',
    passwordTooShort: 'Пароль короче 8 символов',
    cannotChangeOwnRole: 'Нельзя сменить роль собственной учётной записи',
    cannotDisableSelf: 'Нельзя отключить собственную учётную запись'
  }
}
