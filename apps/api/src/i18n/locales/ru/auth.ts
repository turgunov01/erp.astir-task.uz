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
  /** Password recovery by an emailed link. */
  reset: {
    accepted: 'Если такой адрес есть в системе, мы отправили на него письмо со ссылкой для сброса пароля.',
    linkInvalid: 'Ссылка для сброса пароля недействительна или уже использована. Запросите новую.',
    linkExpired: 'Срок действия ссылки истёк. Запросите новую.',
    done: 'Пароль изменён. Войдите с новым паролем.'
  },
  /** The letter with the reset link. */
  resetEmail: {
    subject: 'Сброс пароля — {studio}',
    greeting: '{name}, здравствуйте.',
    title: 'Сброс пароля',
    intro: 'Мы получили запрос на сброс пароля вашей учётной записи в {studio}.',
    action: 'Сбросить пароль',
    linkFallback: 'Если кнопка не открывается, скопируйте ссылку в адресную строку браузера:',
    validity: 'Ссылка действует {minutes} минут и срабатывает один раз.',
    notYou: 'Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо: пароль останется прежним.'
  },
  /** The confirmation after a reset. */
  passwordChangedEmail: {
    subject: 'Ваш пароль изменён — {studio}',
    title: 'Ваш пароль изменён',
    body: 'Пароль вашей учётной записи в {studio} только что изменён по ссылке из письма. Все открытые сеансы завершены.',
    action: 'Войти',
    notYou: 'Если это были не вы, сразу сбросьте пароль ещё раз и сообщите администратору студии.'
  },
  account: {
    currentPasswordWrong: 'Текущий пароль неверен',
    passwordTooShort: 'Пароль короче 8 символов',
    cannotChangeOwnRole: 'Нельзя сменить роль собственной учётной записи',
    cannotDisableSelf: 'Нельзя отключить собственную учётную запись'
  }
}
