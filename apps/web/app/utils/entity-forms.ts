import {
  ASSET_TYPE_LABEL,
  CLIENT_STATUS_LABEL,
  DOCUMENT_TYPE_LABEL,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  PRIORITY_LABEL,
  PRODUCTION_STATUS_LABEL,
  RENDER_STATUS_LABEL,
  REVIEW_TYPE_LABEL,
  REVISION_STATUS_LABEL,
  ROLE_LABEL,
  enumOptions
} from './labels'
import type { EntityFormConfig } from './entity-form'

/**
 * Form specs for every table-backed entity.
 *
 * Each one mirrors the Zod schema the API validates against, so a field the
 * server will reject never reaches the user as a form input. Fields absent from
 * an update schema are marked `createOnly`; fields that only exist once the row
 * does are marked `editOnly`.
 */

const PROJECT_SOURCE = { url: '/api/projects', labelKeys: ['code', 'name'] }
/*
 * Employees list rows describe the employment record, and the person sits
 * under `user`. Fields like assigneeId reference the user, not the employment
 * record, so the value has to be userId.
 */
const USER_SOURCE = {
  url: '/api/employees',
  valueKey: 'userId',
  labelKeys: ['user.firstName', 'user.lastName']
}

export const CLIENT_FORM: EntityFormConfig = {
  endpoint: '/api/clients',
  createTitle: 'Новый клиент',
  editTitle: 'Редактирование клиента',
  fields: [
    { key: 'name', label: 'Имя', type: 'text', required: true, placeholder: 'Как обращаться' },
    { key: 'companyName', label: 'Компания', type: 'text' },
    { key: 'email', label: 'Email', type: 'text', placeholder: 'name@example.com' },
    { key: 'phone', label: 'Телефон', type: 'text' },
    { key: 'country', label: 'Страна', type: 'text' },
    {
      key: 'status',
      label: 'Статус',
      type: 'select',
      options: enumOptions(CLIENT_STATUS_LABEL)
    },
    { key: 'notes', label: 'Заметки', type: 'textarea' },
    {
      key: 'attachments',
      label: 'Файлы',
      type: 'files',
      attachTo: 'clientId',
      wide: true,
      hint: 'Фото, видео, аудио или документ. Загрузятся сразу после сохранения.'
    }
]
}

export const ASSET_FORM: EntityFormConfig = {
  endpoint: '/api/assets',
  createTitle: 'Новый ассет',
  editTitle: 'Редактирование ассета',
  fields: [
    { key: 'name', label: 'Название', type: 'text', required: true },
    {
      key: 'type',
      label: 'Тип',
      type: 'select',
      required: true,
      options: enumOptions(ASSET_TYPE_LABEL)
    },
    {
      key: 'projectId',
      label: 'Проект',
      type: 'select',
      source: PROJECT_SOURCE,
      placeholder: 'Общий'
    },
    { key: 'ownerId', label: 'Владелец', type: 'select', source: USER_SOURCE },
    {
      key: 'status',
      label: 'Статус',
      type: 'select',
      options: enumOptions(PRODUCTION_STATUS_LABEL)
    },
    { key: 'thumbnailUrl', label: 'Ссылка на превью', type: 'text', wide: true },
    { key: 'description', label: 'Описание', type: 'textarea' },
    {
      key: 'attachments',
      label: 'Файлы',
      type: 'files',
      attachTo: 'assetId',
      wide: true,
      hint: 'Фото, видео, аудио или документ. Загрузятся сразу после сохранения.'
    }
]
}

export const DOCUMENT_FORM: EntityFormConfig = {
  endpoint: '/api/files',
  createTitle: 'Новый документ',
  editTitle: 'Редактирование документа',
  fields: [
    { key: 'name', label: 'Название', type: 'text', required: true },
    {
      key: 'type',
      label: 'Тип',
      type: 'select',
      required: true,
      options: enumOptions(DOCUMENT_TYPE_LABEL)
    },
    { key: 'projectId', label: 'Проект', type: 'select', source: PROJECT_SOURCE },
    {
      key: 'clientId',
      label: 'Клиент',
      type: 'select',
      source: { url: '/api/clients', labelKeys: ['name'] }
    }
  ]
}

export const EPISODE_FORM: EntityFormConfig = {
  endpoint: '/api/episodes',
  createTitle: 'Новый эпизод',
  editTitle: 'Редактирование эпизода',
  fields: [
    {
      key: 'projectId',
      label: 'Проект',
      type: 'select',
      required: true,
      source: PROJECT_SOURCE,
      createOnly: true
    },
    { key: 'title', label: 'Название', type: 'text', required: true },
    { key: 'number', label: 'Номер', type: 'number', hint: 'Пусто — следующий свободный' },
    { key: 'duration', label: 'Длительность, сек', type: 'number' },
    {
      key: 'status',
      label: 'Статус',
      type: 'select',
      options: enumOptions(PRODUCTION_STATUS_LABEL)
    },
    { key: 'startDate', label: 'Старт', type: 'date' },
    { key: 'deadline', label: 'Срок', type: 'date' },
    { key: 'description', label: 'Описание', type: 'textarea' },
    {
      key: 'attachments',
      label: 'Файлы',
      type: 'files',
      attachTo: 'episodeId',
      wide: true,
      hint: 'Фото, видео, аудио или документ. Загрузятся сразу после сохранения.'
    }
]
}

export const SCENE_FORM: EntityFormConfig = {
  endpoint: '/api/scenes',
  createTitle: 'Новая сцена',
  editTitle: 'Редактирование сцены',
  fields: [
    {
      key: 'projectId',
      label: 'Проект',
      type: 'select',
      required: true,
      source: PROJECT_SOURCE,
      createOnly: true
    },
    {
      key: 'episodeId',
      label: 'Эпизод',
      type: 'select',
      source: { url: '/api/episodes', labelKeys: ['title'] }
    },
    { key: 'name', label: 'Название', type: 'text', required: true },
    { key: 'sceneNumber', label: 'Номер', type: 'number', hint: 'Пусто — следующий свободный' },
    { key: 'duration', label: 'Длительность, сек', type: 'number' },
    {
      key: 'status',
      label: 'Статус',
      type: 'select',
      options: enumOptions(PRODUCTION_STATUS_LABEL)
    },
    { key: 'description', label: 'Описание', type: 'textarea' },
    {
      key: 'attachments',
      label: 'Файлы',
      type: 'files',
      attachTo: 'sceneId',
      wide: true,
      hint: 'Фото, видео, аудио или документ. Загрузятся сразу после сохранения.'
    }
]
}

export const SHOT_FORM: EntityFormConfig = {
  endpoint: '/api/shots',
  createTitle: 'Новый шот',
  editTitle: 'Редактирование шота',
  fields: [
    {
      key: 'projectId',
      label: 'Проект',
      type: 'select',
      required: true,
      source: PROJECT_SOURCE,
      createOnly: true
    },
    {
      key: 'sceneId',
      label: 'Сцена',
      type: 'select',
      source: { url: '/api/scenes', labelKeys: ['name'] }
    },
    { key: 'name', label: 'Название', type: 'text' },
    { key: 'shotNumber', label: 'Номер', type: 'number', hint: 'Пусто — следующий свободный' },
    { key: 'fps', label: 'FPS', type: 'number' },
    { key: 'startFrame', label: 'Первый кадр', type: 'number' },
    { key: 'endFrame', label: 'Последний кадр', type: 'number' },
    { key: 'duration', label: 'Длительность, сек', type: 'number' },
    { key: 'assigneeId', label: 'Исполнитель', type: 'select', source: USER_SOURCE },
    {
      key: 'status',
      label: 'Статус',
      type: 'select',
      options: enumOptions(PRODUCTION_STATUS_LABEL)
    },
    { key: 'deadline', label: 'Срок', type: 'date' },
    { key: 'description', label: 'Описание', type: 'textarea' },
    {
      key: 'attachments',
      label: 'Файлы',
      type: 'files',
      attachTo: 'shotId',
      wide: true,
      hint: 'Фото, видео, аудио или документ. Загрузятся сразу после сохранения.'
    }
]
}

export const REVISION_FORM: EntityFormConfig = {
  endpoint: '/api/revisions',
  createTitle: 'Новая правка',
  editTitle: 'Редактирование правки',
  fields: [
    {
      key: 'projectId',
      label: 'Проект',
      type: 'select',
      required: true,
      source: PROJECT_SOURCE,
      createOnly: true
    },
    { key: 'title', label: 'Правка', type: 'text', required: true },
    {
      key: 'shotId',
      label: 'Шот',
      type: 'select',
      source: { url: '/api/shots', labelKeys: ['code'] }
    },
    {
      key: 'taskId',
      label: 'Задача',
      type: 'select',
      source: { url: '/api/tasks', labelKeys: ['title'] }
    },
    { key: 'assignedToId', label: 'Исполнитель', type: 'select', source: USER_SOURCE },
    { key: 'priority', label: 'Приоритет', type: 'select', options: enumOptions(PRIORITY_LABEL) },
    {
      key: 'status',
      label: 'Статус',
      type: 'select',
      options: enumOptions(REVISION_STATUS_LABEL),
      editOnly: true
    },
    { key: 'deadline', label: 'Срок', type: 'date' },
    { key: 'description', label: 'Описание', type: 'textarea' },
    {
      key: 'attachments',
      label: 'Файлы',
      type: 'files',
      attachTo: 'revisionId',
      wide: true,
      hint: 'Фото, видео, аудио или документ. Загрузятся сразу после сохранения.'
    }
]
}

export const RENDER_FORM: EntityFormConfig = {
  endpoint: '/api/render',
  createTitle: 'Новое задание рендера',
  editTitle: 'Редактирование задания',
  fields: [
    {
      key: 'projectId',
      label: 'Проект',
      type: 'select',
      required: true,
      source: PROJECT_SOURCE,
      createOnly: true
    },
    {
      key: 'shotId',
      label: 'Шот',
      type: 'select',
      source: { url: '/api/shots', labelKeys: ['code'] },
      createOnly: true
    },
    { key: 'startFrame', label: 'Первый кадр', type: 'number', createOnly: true },
    { key: 'endFrame', label: 'Последний кадр', type: 'number', createOnly: true },
    { key: 'priority', label: 'Приоритет', type: 'select', options: enumOptions(PRIORITY_LABEL) },
    {
      key: 'status',
      label: 'Статус',
      type: 'select',
      options: enumOptions(RENDER_STATUS_LABEL),
      editOnly: true
    },
    { key: 'progress', label: 'Прогресс, %', type: 'number', editOnly: true },
    {
      key: 'nodeId',
      label: 'Узел',
      type: 'select',
      source: { url: '/api/render/nodes', labelKeys: ['name'] },
      editOnly: true
    },
    { key: 'errorMessage', label: 'Текст ошибки', type: 'textarea', editOnly: true },
    {
      key: 'attachments',
      label: 'Файлы',
      type: 'files',
      attachTo: 'renderJobId',
      wide: true,
      hint: 'Фото, видео, аудио или документ. Загрузятся сразу после сохранения.'
    }
]
}

export const REVIEW_FORM: EntityFormConfig = {
  endpoint: '/api/reviews',
  createTitle: 'Отправить на согласование',
  editTitle: 'Настройки согласования',
  // A short form: one column keeps the fields from drifting apart.
  columns: 1,
  fields: [
    {
      key: 'versionId',
      label: 'Версия',
      type: 'select',
      required: true,
      source: { url: '/api/versions', labelKeys: ['label'] },
      createOnly: true,
      hint: 'Материал, который выносится на обсуждение'
    },
    {
      key: 'reviewType',
      label: 'Тип согласования',
      type: 'select',
      options: enumOptions(REVIEW_TYPE_LABEL)
    },
    {
      key: 'reviewerId',
      label: 'Проверяющий',
      type: 'select',
      source: USER_SOURCE,
      placeholder: 'Любой из команды'
    },
    {
      key: 'deadline',
      label: 'Срок обсуждения',
      type: 'date',
      hint: 'Если до этой даты решения не будет, согласование получит статус «Вопрос закрыт»'
    },
    {
      key: 'comment',
      label: 'Что обсуждаем',
      type: 'textarea',
      placeholder: 'Вопрос к обсуждению, на что смотреть в первую очередь'
    },
    {
      key: 'attachments',
      label: 'Файлы',
      type: 'files',
      attachTo: 'reviewId',
      wide: true,
      hint: 'Фото, видео, аудио или документ. Загрузятся сразу после сохранения.'
    }
]
}

export const DEPARTMENT_FORM: EntityFormConfig = {
  endpoint: '/api/departments',
  createTitle: 'Новый отдел',
  editTitle: 'Редактирование отдела',
  fields: [
    { key: 'name', label: 'Название', type: 'text', required: true },
    { key: 'description', label: 'Описание', type: 'textarea' },
    {
      key: 'attachments',
      label: 'Файлы',
      type: 'files',
      attachTo: 'departmentId',
      wide: true,
      hint: 'Фото, видео, аудио или документ. Загрузятся сразу после сохранения.'
    }
]
}

export const EMPLOYEE_FORM: EntityFormConfig = {
  endpoint: '/api/employees',
  createTitle: 'Новый сотрудник',
  editTitle: 'Редактирование сотрудника',
  fields: [
    { key: 'firstName', label: 'Имя', type: 'text', required: true },
    { key: 'lastName', label: 'Фамилия', type: 'text', required: true },
    {
      key: 'email',
      label: 'Email',
      type: 'text',
      required: true,
      createOnly: true,
      hint: 'Логин для входа, изменить позже нельзя'
    },
    {
      key: 'password',
      label: 'Пароль',
      type: 'text',
      required: true,
      createOnly: true,
      hint: 'Минимум 8 символов'
    },
    { key: 'position', label: 'Должность', type: 'text', required: true },
    { key: 'role', label: 'Роль', type: 'select', options: enumOptions(ROLE_LABEL) },
    {
      key: 'departmentId',
      label: 'Отдел',
      type: 'select',
      source: { url: '/api/departments', labelKeys: ['name'] }
    },
    {
      key: 'employmentType',
      label: 'Занятость',
      type: 'select',
      options: enumOptions(EMPLOYMENT_TYPE_LABEL)
    },
    { key: 'hourlyRate', label: 'Ставка в час', type: 'number' },
    { key: 'weeklyCapacityHours', label: 'Часов в неделю', type: 'number' },
    {
      key: 'status',
      label: 'Статус',
      type: 'select',
      options: enumOptions(EMPLOYEE_STATUS_LABEL)
    },
    {
      key: 'attachments',
      label: 'Файлы',
      type: 'files',
      attachTo: 'employeeId',
      wide: true,
      hint: 'Фото, видео, аудио или документ. Загрузятся сразу после сохранения.'
    }
]
}
