/**
 * Episodes, scenes, shots, tasks, stages, reviews, revisions, versions, render,
 * assets, uploads and comments. Attendance and timesheets live in team.
 *
 * e.g. `throw badRequest(t('production.tasks.selfDependency'))`.
 */
export default {
  tasks: {
    statusChange: 'статус {change}',
    noChanges: 'без изменений',
    overdueEditReason: 'Задача просрочена. Укажите причину правки — она уйдёт администрации.',
    overdueEditReasonField: 'Укажите причину правки просроченной задачи',
    overdueMoveReason: 'Задача просрочена. Укажите причину переноса — она уйдёт администрации.',
    overdueMoveReasonField: 'Укажите причину',
    prerequisitesUnfinished: 'Сначала нужно закончить задачи-предшественники: {tasks}',
    selfDependency: 'Задача не может зависеть от самой себя',
    crossProjectDependency: 'Зависимости возможны только внутри одного проекта',
    reverseDependency: 'Та задача уже зависит от этой',
    alreadyArchived: 'Задача уже в архиве',
    notArchived: 'Задача не в архиве',
    /** Written into the task discussion when a late task is edited. */
    overdueComment: 'Правка просроченной задачи ({days} дн): {reason}',
    /** Task fields as they are listed in the «late task edited» notification. */
    fields: {
      title: 'название',
      description: 'описание',
      status: 'статус',
      priority: 'приоритет',
      assigneeId: 'исполнитель',
      reviewerId: 'проверяющий',
      episodeId: 'эпизод',
      sceneId: 'сцена',
      shotId: 'шот',
      stageId: 'этап',
      estimatedHours: 'оценка в часах',
      actualHours: 'фактические часы',
      startDate: 'дата начала',
      deadline: 'дедлайн'
    }
  },
  comments: {
    editOwnOnly: 'Редактировать можно только свой комментарий',
    deleteOwnOnly: 'Удалить можно только свой комментарий'
  },
  reviews: {
    alreadyClosed: 'Это согласование уже завершено',
    /** Title of the revision opened when changes are requested. */
    revisionTitle: 'Правки по {target}',
    clientReviewByClient: 'Клиентское согласование закрывает клиент',
    internalNotForClient: 'Внутреннее согласование недоступно клиенту'
  },
  versions: {
    alreadySubmitted: 'Эта версия уже отправлена на согласование',
    approvedDeleteByProduction: 'Согласованную версию может удалить только продакшн',
    projectIdRequired: 'Укажите проект (projectId)',
    fileTypeNotAllowed: 'Тип файла {type} не разрешён'
  },
  episodes: {
    duplicate: 'Эпизод {number} уже есть в этом проекте',
    hasScenes: 'В эпизоде ещё есть сцены: {count}. Сначала удалите их.'
  },
  scenes: {
    otherProjectEpisode: 'Этот эпизод относится к другому проекту',
    duplicate: 'Сцена {number} здесь уже есть',
    hasShots: 'В сцене ещё есть шоты: {count}. Сначала удалите их.'
  },
  shots: {
    duplicate: 'Шот {code} уже есть в этом проекте'
  },
  stages: {
    hasTasks: 'К этапу ещё привязаны задачи: {count}.'
  },
  assets: {
    hasVersions: 'У ассета ещё есть версии: {count}. Сначала удалите их.'
  },
  uploads: {
    typeUnsupported: 'Тип файла {type} не поддерживается',
    tooManyOpen: 'Слишком много незавершённых загрузок. Завершите или отмените их.',
    chunkOutOfRange: 'Номер части вне диапазона: {index} из {total}',
    chunkWrongSize: 'Часть {index} должна быть {expected} байт, а не {actual}',
    chunksMissing: 'Получены не все части файла',
    chunkTooBig: 'Часть файла больше заявленного размера',
    chunkIncomplete: 'Часть {index} неполная: получено {received} из {expected} байт',
    completing: 'Загрузка уже завершается'
  }
}
