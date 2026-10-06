/** Finance, payroll and reports: messages and CSV export headings. */
export default {
  csv: {
    studioOverhead: 'Студия (без проекта)',
    date: 'Дата',
    project: 'Проект',
    client: 'Клиент',
    category: 'Категория',
    vendor: 'Контрагент',
    description: 'Описание',
    paymentMethod: 'Способ оплаты',
    documentNumber: 'Документ №',
    documentUrl: 'Ссылка на документ',
    amount: 'Сумма',
    vatIncluded: 'В т.ч. НДС',
    currency: 'Валюта',
    createdBy: 'Внёс',
    paidDate: 'Дата оплаты',
    dueDate: 'Срок',
    invoice: 'Счёт',
    status: 'Статус',
    method: 'Способ',
    reference: 'Номер транзакции',
    fee: 'Комиссия',
    notes: 'Примечание',
    number: 'Номер',
    issuedAt: 'Выставлен',
    payBy: 'Оплатить до',
    purpose: 'Назначение',
    daysOverdue: 'Просрочен, дней',
    paid: 'Оплачено',
    remaining: 'Остаток',
    code: 'Код',
    risk: 'Риск',
    progress: 'Прогресс, %',
    deadline: 'Дедлайн',
    late: 'Просрочен',
    stagesTotal: 'Этапов всего',
    stagesDone: 'Этапов готово',
    tasksTotal: 'Задач всего',
    tasksDone: 'Задач готово',
    tasksOverdue: 'Задач просрочено',
    revisionsOpen: 'Открытых правок',
    term: 'Срок',
    invoicesCount: 'Счетов',
    month: 'Месяц',
    invoiced: 'Выставлено',
    collected: 'Получено',
    spent: 'Потрачено',
    net: 'Итого',
    employee: 'Сотрудник',
    position: 'Должность',
    department: 'Отдел',
    rate: 'Ставка',
    hours: 'Часов',
    unpricedHours: 'Часов без ставки',
    cost: 'Стоимость',
    projectsCount: 'Проектов',
    outstanding: 'Остаток',
    avgDaysToPay: 'Средний срок оплаты, дней'
  },
  /** Receivables ageing buckets, by the key the report computes. */
  ageing: {
    current: 'Не просрочено',
    d30: '1-30 дней',
    d60: '31-60 дней',
    d90: '61-90 дней',
    over90: 'Больше 90 дней'
  },
  payments: {
    feeTooLarge: 'Комиссия не может быть больше суммы платежа'
  },
  expenses: {
    vatTooLarge: 'НДС не может быть больше суммы'
  },
  budget: {
    categoryOnce: 'Каждая категория указывается один раз'
  },
  payroll: {
    /** Entry statuses inside sentences: «Запись «черновик» …». */
    status: {
      DRAFT: 'черновик',
      APPROVED: 'утверждено',
      PAID: 'выплачено',
      CANCELLED: 'отменено'
    },
    employeeMissing: 'Сотрудник не найден или удалён',
    latenessMinutesRequired: 'Для штрафа за опоздание укажите, на сколько минут опоздал сотрудник',
    externalIdTaken: 'Запись с этим внешним идентификатором уже есть',
    onlyDraftEditable: 'Изменять можно только черновик. Запись «{status}» сначала верните в черновик.',
    transitionNotAllowed: 'Нельзя перевести запись из «{from}» в «{to}»',
    deleteOnlyDraft: 'Удалить можно только черновик или отменённую запись. Утверждённую сначала отмените.'
  }
}
