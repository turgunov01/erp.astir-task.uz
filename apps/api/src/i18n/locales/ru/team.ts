/** People, settings and notifications, including the notification letters. */
export default {
  notifications: {
    deadline: 'срок {date}',
    taskAssigned: 'Вам назначена задача: {title}',
    projectAssigned: 'Вас добавили в проект: {name}',
    commentMention: 'Вас упомянули в обсуждении',
    renderFailed: 'Рендер упал: {code}',
    versionApproved: 'Версия согласована: {label}',
    changesRequested: 'Запрошены правки: {label}',
    versionRejected: 'Версия отклонена: {label}',
    revisionCreated: 'Новая правка: {title}',
    revisionAssigned: 'Вам назначена правка: {title}',
    revisionRound: '{code} · раунд {round}',
    versionSubmitted: 'На согласование: {label}',
    overdueEdited: 'Правка просроченной задачи: {title}',
    overdueEditedBody: 'просрочка {days} дн · {change}',
    overdueReason: 'причина: {reason}'
  },
  /** The email copy of a notification. */
  email: {
    greeting: 'Здравствуйте.',
    greetingNamed: '{name}, здравствуйте.',
    open: 'Открыть',
    openTask: 'Открыть задачу',
    openProject: 'Открыть проект',
    unsubscribeText: 'Такие письма можно отключить в профиле: {link}',
    unsubscribeLink: 'отключить такие письма в профиле'
  },
  settings: {
    workDayEndBeforeStart: 'Конец рабочего дня должен быть позже начала',
    pickWorkday: 'Выберите хотя бы один рабочий день',
    noEmail: 'У текущей учётной записи нет почты',
    mailTestSubject: '{studio} — проверка почты',
    mailTestBody: 'Если вы читаете это письмо, отправка почты из {studio} настроена верно.',
    mailTestSent: 'Письмо отправлено на {email}',
    mailTestLogged: 'SMTP не настроен — письмо записано в лог сервера, а не отправлено',
    templateNeedsStage: 'Нужен хотя бы один этап'
  }
}
