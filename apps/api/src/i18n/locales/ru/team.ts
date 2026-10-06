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
    templateNeedsStage: 'Нужен хотя бы один этап',
    selfLockout: 'Нельзя лишить собственную роль доступа к настройкам и управлению правами',
    beyondOwnRole: 'Нельзя выдать права, которых нет у вашей роли: {permissions}',
    beyondRoleCeiling: 'Этой роли нельзя выдать: {permissions}',
    noEmailForType: 'Для этого типа уведомлений письма не отправляются'
  },
  employees: {
    emailTaken: 'Пользователь с почтой {email} уже существует',
    cannotDeleteSelf: 'Нельзя удалить собственную учётную запись'
  },
  departments: {
    hasEmployees: 'В отделе ещё есть сотрудники: {count}. Сначала переведите их в другой отдел.'
  },
  timesheets: {
    noEmployee: 'Ваша учётная запись не привязана к сотруднику, поэтому часы записать нельзя',
    ownOnly: 'Менять можно только свои записи табеля'
  },
  attendance: {
    dayNotYet: 'Этот день ещё не наступил',
    futureDayCorrection: 'Нельзя исправить день, который ещё не наступил',
    checkInRequired: 'Укажите время прихода — без него время ухода ничего не значит',
    checkOutAfterCheckIn: 'Уход должен быть позже прихода',
    notCorrected: 'Этот день не исправлялся вручную',
    correctionReason: 'Опишите причину исправления',
    staffOnly: 'Отметка прихода доступна только сотрудникам студии',
    correctedByAdmin: 'Этот день уже исправил администратор — отмечаться не нужно',
    checkInFirst: 'Сначала отметьте приход — нажмите «Я приехал»',
    checkOutByAdmin: 'Этот день исправил администратор — время ухода внесёт он',
    penaltyRateMissing: 'Ставка штрафа за опоздание не задана. Укажите её в Настройках → Рабочий график.',
    /** Reason written into the payroll entry a lateness run creates. */
    penaltyReason: 'Опоздание на {minutes} мин: приход {arrival} при начале в {start}',
    penaltyMarked: '(посещаемость)',
    penaltyUnmarked: '(без отметки «Я приехал» — по первой активности)'
  }
}
