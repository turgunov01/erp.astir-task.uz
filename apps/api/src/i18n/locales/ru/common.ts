/**
 * Generic API messages: error envelope defaults, validation wording, enum
 * names written into files. Russian is the source; uz/en/tr mirror the keys.
 *
 * Placeholders are `{name}`; plural forms are separated by ` | `
 * (Russian: one | few | many) and chosen by the `count` parameter.
 */
export default {
  errors: {
    unauthenticated: 'Нужно войти в систему',
    invalidCredentials: 'Неверная почта или пароль',
    tokenExpired: 'Сессия истекла, войдите заново',
    sessionInvalid: 'Сессия недействительна, войдите заново',
    sessionNotFound: 'Сессия не найдена, войдите заново',
    sessionRevoked: 'Сессия больше не действует, войдите заново',
    accountGone: 'Учётная запись больше не существует',
    accountDisabled: 'Учётная запись отключена',
    forbidden: 'Недостаточно прав для этого действия',
    rateLimited: 'Слишком много запросов. Подождите минуту и попробуйте снова.',
    loginRateLimited: 'Слишком много попыток входа. Попробуйте позже.',
    routeNotFound: 'Адрес {method} {path} не существует',
    fileTooLargeForOneRequest: 'Файл слишком большой для одного запроса — загрузите его по частям через /api/uploads',
    checkFields: 'Проверьте заполнение полей',
    duplicate: 'Запись с таким значением уже существует ({target})',
    recordNotFound: 'Запись не найдена',
    relatedConflict: 'Связанная запись не найдена или ещё используется',
    databaseUnavailable: 'База данных недоступна. Попробуйте ещё раз, когда соединение восстановится.',
    internal: 'Внутренняя ошибка сервера',
    unknown: 'Неизвестная ошибка',
    periodReversed: 'Начало периода позже его конца',
    // Genitive after «длиннее»: 21 дня, 62 дней.
    periodTooLong: 'Период не может быть длиннее {count} дня | Период не может быть длиннее {count} дней | Период не может быть длиннее {count} дней'
  },
  /** «… не найден», by the resource name the code passes to notFound(). */
  notFound: {
    asset: 'Ассет не найден',
    budget: 'Бюджет не найден',
    client: 'Клиент не найден',
    comment: 'Комментарий не найден',
    parentComment: 'Комментарий, на который вы отвечаете, не найден',
    department: 'Отдел не найден',
    document: 'Документ не найден',
    employee: 'Сотрудник не найден',
    episode: 'Эпизод не найден',
    expense: 'Расход не найден',
    invoice: 'Счёт не найден',
    payment: 'Платёж не найден',
    notification: 'Уведомление не найдено',
    payrollEntry: 'Начисление не найдено',
    pipelineTemplate: 'Шаблон пайплайна не найден',
    prerequisiteTask: 'Задача-предшественник не найдена',
    project: 'Проект не найден',
    projectMember: 'Участник проекта не найден',
    renderJob: 'Задание рендера не найдено',
    review: 'Согласование не найдено',
    revision: 'Правка не найдена',
    role: 'Роль не найдена',
    scene: 'Сцена не найдена',
    shot: 'Шот не найден',
    shotStage: 'Этап шота не найден',
    stage: 'Этап не найден',
    target: 'Объект не найден',
    task: 'Задача не найдена',
    timesheetEntry: 'Запись табеля не найдена',
    uploadSession: 'Загрузка не найдена или уже завершена',
    user: 'Пользователь не найден',
    version: 'Версия не найдена'
  },
  /** Field-level validation wording (the zod error map and shared schemas). */
  validation: {
    required: 'Обязательное поле',
    invalidFormat: 'Неверный формат значения',
    chooseFromList: 'Выберите значение из списка',
    invalidEmail: 'Неверный адрес почты',
    invalidId: 'Неверный идентификатор',
    invalidUrl: 'Неверная ссылка',
    invalidDate: 'Неверная дата',
    fillIn: 'Заполните поле',
    // Genitive after «не короче / не длиннее»: 1 символа, 2 символов, 21 символа.
    minLength: 'Не короче {count} символа | Не короче {count} символов | Не короче {count} символов',
    maxLength: 'Не длиннее {count} символа | Не длиннее {count} символов | Не длиннее {count} символов',
    minValue: 'Значение не меньше {limit}',
    maxValue: 'Значение не больше {limit}',
    minItems: 'Выберите не меньше {limit}',
    maxItems: 'Не больше {limit}',
    timeFormat: 'Ожидается время ЧЧ:ММ',
    passwordsMismatch: 'Пароли не совпадают',
    codeSixDigits: 'Код состоит из шести цифр',
    commentEmpty: 'Комментарий не может быть пустым',
    nothingToSave: 'Нет изменений для сохранения',
    deadlineBeforeStart: 'Дедлайн не может быть раньше даты старта',
    describeChanges: 'Опишите, что нужно исправить',
    attachOrDescribe: 'Приложите файл или опишите, что сделано',
    fileOver1Gb: 'Файл больше 1 ГБ',
    projectCodeFormat: 'Только заглавные латинские буквы, цифры и дефис',
    dateFormat: 'Дата должна быть в формате ГГГГ-ММ-ДД',
    monthFormat: 'Ожидается месяц в формате ГГГГ-ММ',
    invalidDateValue: 'Неверная дата: {value}',
    httpLink: 'Ссылка должна начинаться с http:// или https://',
    bothBounds: 'Укажите обе границы периода'
  },
  yes: 'да',
  no: 'нет',
  unknownValue: 'Не указано',
  /** Enum members as people read them in exports and letters. */
  enum: {
    taskStatus: {
      BACKLOG: 'Бэклог', READY: 'Готова к работе', IN_PROGRESS: 'В работе', REVIEW: 'На проверке',
      REVISION: 'На правках', APPROVED: 'Утверждена', DONE: 'Завершена', BLOCKED: 'Заблокирована'
    },
    projectStatus: {
      DRAFT: 'Черновик', PLANNING: 'Планирование', PRE_PRODUCTION: 'Препродакшен',
      PRODUCTION: 'Продакшен', POST_PRODUCTION: 'Постпродакшен', CLIENT_REVIEW: 'У клиента',
      DELIVERY: 'Сдача', COMPLETED: 'Завершён', ON_HOLD: 'Приостановлен',
      CANCELLED: 'Отменён', ARCHIVED: 'В архиве'
    },
    risk: { LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий', CRITICAL: 'Критический' },
    clientStatus: { ACTIVE: 'Активен', INACTIVE: 'Неактивен', ARCHIVED: 'В архиве' },
    paymentMethod: { BANK_TRANSFER: 'Перечисление', CASH: 'Наличные', CARD: 'Карта', OTHER: 'Другое' },
    paymentStatus: {
      PENDING: 'Ожидает оплаты', PARTIALLY_PAID: 'Оплачен частично', PAID: 'Оплачен',
      OVERDUE: 'Просрочен', CANCELLED: 'Отменён'
    },
    expenseCategory: {
      EMPLOYEE: 'Штат', FREELANCER: 'Подряд', RENDER: 'Рендер', SOFTWARE: 'Софт',
      HARDWARE: 'Железо', AUDIO: 'Звук', PRODUCTION: 'Продакшн', OFFICE: 'Аренда и офис',
      TAXES: 'Налоги и сборы', MARKETING: 'Маркетинг', OTHER: 'Прочее'
    },
    role: {
      OWNER: 'Владелец', ADMIN: 'Администратор', PRODUCER: 'Продюсер',
      PROJECT_MANAGER: 'Менеджер проекта', ART_DIRECTOR: 'Арт-директор',
      ARTIST: 'Художник', CLIENT: 'Клиент', FINANCE: 'Финансы'
    }
  },
  /** «В работе» → «На проверке», as a status move reads in comments and letters. */
  statusChange: '«{from}» → «{to}»'
}
