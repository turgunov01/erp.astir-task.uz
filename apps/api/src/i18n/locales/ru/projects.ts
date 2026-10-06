/** Projects, clients, documents, files, dashboard and timeline. */
export default {
  /** What a lead is on a project, in the «added to project» notification. */
  leadRole: {
    projectManager: 'Менеджер проекта',
    producer: 'Продюсер'
  },
  codeTaken: 'Код проекта {code} уже занят',
  confirmDeleteCode: 'Введите код проекта, чтобы подтвердить удаление без возврата',
  members: {
    accountDisabled: 'Эта учётная запись отключена',
    alreadyMember: 'Этот человек уже в команде проекта',
    hasOpenTasks: 'У этого человека ещё есть открытые задачи: {count}. Сначала переназначьте их.'
  },
  clients: {
    hasActiveProjects: 'У клиента есть активные проекты: {count}. Сначала завершите или переназначьте их.'
  },
  files: {
    notReceived: 'Файл не получен',
    typeNotAllowed: 'Этот тип файла загружать нельзя: {type}',
    unknownTarget: 'Неизвестно, к чему прикрепить файл: {target}',
    targetRequired: 'Прикрепите файл к записи, проекту или клиенту'
  },
  /** The five coarse pipeline phases on the dashboard. */
  dashboard: {
    phase: {
      preProduction: 'Препродакшн',
      production: 'Продакшн',
      postProduction: 'Постпродакшн',
      review: 'Согласование',
      delivery: 'Поставка'
    }
  }
}
