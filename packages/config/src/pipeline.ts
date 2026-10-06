/**
 * Default animation pipeline (spec 11).
 *
 * `weight` drives project progress: a stage contributes proportionally to
 * its weight rather than every stage counting equally (spec 56). Rendering
 * and animation carry the most schedule risk, so they weigh heaviest.
 */
export interface PipelineStageTemplate {
  name: string
  order: number
  weight: number
  /** Department that normally owns this stage; matched by name at seed time. */
  department?: string
}

export const DEFAULT_PIPELINE: readonly PipelineStageTemplate[] = [
  { name: 'Бриф', order: 1, weight: 1, department: 'Руководство' },
  { name: 'Сценарий', order: 2, weight: 1, department: 'Руководство' },
  { name: 'Раскадровка', order: 3, weight: 2, department: '2D' },
  { name: 'Аниматик', order: 4, weight: 2, department: '2D' },
  { name: 'Концепт-арт', order: 5, weight: 2, department: '2D' },
  { name: 'Дизайн персонажей', order: 6, weight: 2, department: '2D' },
  { name: 'Дизайн окружения', order: 7, weight: 2, department: '2D' },
  { name: 'Моделинг', order: 8, weight: 3, department: 'Моделинг' },
  { name: 'Риггинг', order: 9, weight: 3, department: 'Риггинг' },
  { name: 'Лейаут', order: 10, weight: 2, department: '3D' },
  { name: 'Анимация', order: 11, weight: 5, department: 'Анимация' },
  { name: 'Симуляции и FX', order: 12, weight: 3, department: '3D' },
  { name: 'Свет', order: 13, weight: 3, department: 'Свет' },
  { name: 'Рендер', order: 14, weight: 4, department: 'Рендер' },
  { name: 'Композитинг', order: 15, weight: 3, department: 'Композитинг' },
  { name: 'Звук', order: 16, weight: 2, department: 'Звук' },
  { name: 'Монтаж', order: 17, weight: 2, department: 'Монтаж' },
  { name: 'Внутренний просмотр', order: 18, weight: 1, department: 'Продакшн' },
  { name: 'Просмотр клиентом', order: 19, weight: 1, department: 'Продакшн' },
  { name: 'Правки', order: 20, weight: 2, department: 'Продакшн' },
  { name: 'Финальный рендер', order: 21, weight: 2, department: 'Рендер' },
  { name: 'Сдача', order: 22, weight: 1, department: 'Продакшн' }
]

/** Departments seeded on a fresh studio (spec 30). */
export const DEFAULT_DEPARTMENTS: readonly string[] = [
  'Продакшн',
  '2D',
  '3D',
  'Анимация',
  'Моделинг',
  'Риггинг',
  'Свет',
  'Рендер',
  'Композитинг',
  'Звук',
  'Монтаж',
  'Руководство',
  'Финансы'
]

/**
 * Project templates (spec 84). Each names the subset of DEFAULT_PIPELINE
 * that applies; anything not listed is skipped for that project type.
 */
export const PROJECT_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  '2D-анимация': [
    'Бриф', 'Сценарий', 'Раскадровка', 'Аниматик', 'Концепт-арт',
    'Дизайн персонажей', 'Дизайн окружения', 'Анимация', 'Композитинг',
    'Звук', 'Монтаж', 'Внутренний просмотр', 'Просмотр клиентом', 'Правки',
    'Финальный рендер', 'Сдача'
  ],
  '3D-анимация': [
    'Бриф', 'Сценарий', 'Раскадровка', 'Аниматик', 'Концепт-арт',
    'Дизайн персонажей', 'Дизайн окружения', 'Моделинг', 'Риггинг', 'Лейаут',
    'Анимация', 'Симуляции и FX', 'Свет', 'Рендер', 'Композитинг',
    'Звук', 'Монтаж', 'Внутренний просмотр', 'Просмотр клиентом', 'Правки',
    'Финальный рендер', 'Сдача'
  ],
  'Рекламный ролик': [
    'Бриф', 'Сценарий', 'Раскадровка', 'Аниматик', 'Анимация', 'Композитинг',
    'Звук', 'Монтаж', 'Внутренний просмотр', 'Просмотр клиентом', 'Правки',
    'Финальный рендер', 'Сдача'
  ],
  'Моушн-дизайн': [
    'Бриф', 'Сценарий', 'Раскадровка', 'Анимация', 'Композитинг', 'Звук',
    'Монтаж', 'Внутренний просмотр', 'Просмотр клиентом', 'Правки', 'Сдача'
  ],
  'Серия сериала': [
    'Бриф', 'Раскадровка', 'Аниматик', 'Лейаут', 'Анимация', 'Свет',
    'Рендер', 'Композитинг', 'Звук', 'Монтаж', 'Внутренний просмотр',
    'Просмотр клиентом', 'Правки', 'Финальный рендер', 'Сдача'
  ]
}
