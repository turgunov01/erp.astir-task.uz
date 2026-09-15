'use strict'
/**
 * What gets entered, in the words a studio would use. Dates are offsets in
 * days from START, the brief meeting of the first project.
 */
export const START = new Date('2026-05-04T09:00:00+05:00')
export function day(offset, hour = 10) {
  const date = new Date(START)
  date.setDate(date.getDate() + offset)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}
export function dayOnly(offset) {
  return day(offset).slice(0, 10)
}

export const DEPARTMENTS = [
  // The studio's own files (the logo, policies) hang off this one.
  ['Management', 'Руководство студии'],
  ['Production', 'Продюсеры и проектные менеджеры'], ['2D', 'Раскадровка, концепт, дизайн'], ['3D', 'Лейаут и FX'],
  ['Animation', 'Аниматоры'], ['Modeling', 'Моделинг и текстуры'], ['Rigging', 'Риггеры'], ['Lighting', 'Свет и шейдинг'],
  ['Rendering', 'Рендер-ферма'], ['Compositing', 'Композитинг'], ['Sound', 'Звук и озвучка'], ['Editing', 'Монтаж'],
  ['Finance', 'Финансы и документы']
]

export const STAFF = [
  { key: 'producer', email: 'producer@astir.uz', firstName: 'Тимур', lastName: 'Юсупов', role: 'PRODUCER', position: 'Исполнительный продюсер', department: 'Production', rate: 45 },
  { key: 'pm', email: 'pm@astir.uz', firstName: 'Камила', lastName: 'Назарова', role: 'PROJECT_MANAGER', position: 'Проектный менеджер', department: 'Production', rate: 35 },
  { key: 'ad', email: 'art@astir.uz', firstName: 'Руслан', lastName: 'Абдуллаев', role: 'ART_DIRECTOR', position: 'Арт-директор', department: '2D', rate: 40 },
  { key: 'finance', email: 'finance@astir.uz', firstName: 'Малика', lastName: 'Турсунова', role: 'FINANCE', position: 'Финансовый менеджер', department: 'Finance', rate: 30 },
  { key: 'gulnora', email: 'gulnora@astir.uz', firstName: 'Гульнора', lastName: 'Ахмедова', role: 'ARTIST', position: 'Сторибордист', department: '2D', rate: 25 },
  { key: 'bekzod', email: 'bekzod@astir.uz', firstName: 'Бекзод', lastName: 'Исмоилов', role: 'ARTIST', position: '3D-моделлер', department: 'Modeling', rate: 25 },
  { key: 'zilola', email: 'zilola@astir.uz', firstName: 'Зилола', lastName: 'Умарова', role: 'ARTIST', position: 'Художник по текстурам', department: 'Modeling', rate: 23, employment: 'PART_TIME', capacity: 20 },
  { key: 'sardor', email: 'sardor@astir.uz', firstName: 'Сардор', lastName: 'Эргашев', role: 'ARTIST', position: 'Риггер', department: 'Rigging', rate: 26 },
  { key: 'marat', email: 'marat@astir.uz', firstName: 'Марат', lastName: 'Юлдашев', role: 'ARTIST', position: 'Layout-артист', department: '3D', rate: 24 },
  { key: 'anna', email: 'anna@astir.uz', firstName: 'Анна', lastName: 'Волкова', role: 'ARTIST', position: 'Старший аниматор', department: 'Animation', rate: 28 },
  { key: 'shohruh', email: 'shohruh@astir.uz', firstName: 'Шохрух', lastName: 'Назаров', role: 'ARTIST', position: 'FX-артист', department: '3D', rate: 30, employment: 'FREELANCE' },
  { key: 'nigora', email: 'nigora@astir.uz', firstName: 'Нигора', lastName: 'Саидова', role: 'ARTIST', position: 'Художник по свету', department: 'Lighting', rate: 27 },
  { key: 'sherzod', email: 'sherzod@astir.uz', firstName: 'Шерзод', lastName: 'Мирзаев', role: 'ARTIST', position: 'Render TD', department: 'Rendering', rate: 29 },
  { key: 'javohir', email: 'javohir@astir.uz', firstName: 'Жавохир', lastName: 'Кодиров', role: 'ARTIST', position: 'Композер', department: 'Compositing', rate: 26 },
  { key: 'dilshod', email: 'dilshod@astir.uz', firstName: 'Дилшод', lastName: 'Рустамов', role: 'ARTIST', position: 'Саунд-дизайнер', department: 'Sound', rate: 27, employment: 'FREELANCE' },
  { key: 'farrux', email: 'farrux@astir.uz', firstName: 'Фаррух', lastName: 'Собиров', role: 'ARTIST', position: 'Монтажёр', department: 'Editing', rate: 26 }
]

export const DEPARTMENT_LEAD = {
  Management: 'pm', Production: 'pm', '2D': 'gulnora', '3D': 'marat', Animation: 'anna', Modeling: 'bekzod',
  Rigging: 'sardor', Lighting: 'nigora', Rendering: 'sherzod', Compositing: 'javohir', Sound: 'dilshod', Editing: 'farrux', Finance: 'finance'
}

export const CLIENTS = [
  { key: 'reply', name: '24reply.ai', companyName: '24reply LLC', email: 'hello@24reply.ai', phone: '+998 71 200 24 24', country: 'Uzbekistan', notes: 'AI-ассистент для бизнеса: отвечает клиентам в мессенджерах за секунды. Пришли по рекомендации.' },
  { key: 'nurbank', name: 'Nur Bank', companyName: 'АКБ «Nur Bank»', email: 'marketing@nurbank.uz', phone: '+998 71 150 10 10', country: 'Uzbekistan', notes: 'Розничный банк, обновляет бренд. Хотят имиджевый ролик к запуску нового приложения.' },
  { key: 'kids', name: 'Bright Kids TV', companyName: 'Bright Kids Television', email: 'production@brightkids.tv', phone: '+7 727 300 45 45', country: 'Kazakhstan', notes: 'Детский телеканал. Серия коротких обучающих роликов, 2D.' }
]

/** Stage windows for the finished project, day offsets. */
export const STAGE_WINDOWS = {
  'Brief': [0, 4], 'Script': [3, 12], 'Storyboard': [10, 22], 'Animatic': [20, 28], 'Concept Art': [14, 30],
  'Character Design': [22, 38], 'Environment Design': [26, 42], 'Modeling': [34, 56], 'Rigging': [46, 62],
  'Layout': [52, 66], 'Animation': [60, 92], 'Simulation / FX': [78, 98], 'Lighting': [84, 104],
  'Rendering': [92, 110], 'Compositing': [98, 114], 'Sound': [90, 112], 'Editing': [106, 116],
  'Internal Review': [114, 117], 'Client Review': [117, 121], 'Corrections': [120, 124],
  'Final Render': [123, 126], 'Delivery': [126, 127]
}

export const MAIN_PROJECT = {
  code: 'AST-001',
  name: '24reply.ai — продуктовые ролики',
  client: 'reply',
  template: '3D Animation',
  projectType: 'COMMERCIAL',
  priority: 'HIGH',
  budget: 120000,
  startDay: 0,
  deadlineDay: 129,
  description: 'Серия из трёх продуктовых роликов для AI-ассистента 24reply.ai к запуску: hero-ролик 60″, объясняющий ролик «Как это работает» 45″ и сравнительный «Бот vs ИИ-менеджер» 30″. 3D-маскот, моушн-графика интерфейса, озвучка UZ/RU/EN.',
  episodes: [
    { number: 1, title: 'Ролик 1 — Hero: «Скорость ответа»', duration: 60, scenes: ['Открытие — клиент пишет ночью', 'Маскот «24» отвечает за секунды', 'Финал — логотип и слоган'] },
    { number: 2, title: 'Ролик 2 — «Как это работает»', duration: 45, scenes: ['Подключение к мессенджерам', 'Панель менеджера и чат', 'Передача вопроса человеку'] },
    { number: 3, title: 'Ролик 3 — «Бот vs ИИ-менеджер»', duration: 30, scenes: ['Старый бот теряет клиента', 'ИИ-менеджер закрывает сделку', 'Сравнение и призыв'] }
  ],
  shotNames: ['Общий план', 'Средний план', 'Крупный план / деталь интерфейса'],
  statusPath: ['PLANNING', 'PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION', 'CLIENT_REVIEW', 'DELIVERY', 'COMPLETED']
}

export const GENERAL_TASKS = [
  { stage: 'Brief', title: 'Бриф клиента и референсы', assignee: 'pm', reviewer: 'producer', estimate: 6, actual: 5, priority: 'HIGH' },
  { stage: 'Script', title: 'Сценарии трёх роликов (60″ / 45″ / 30″)', assignee: 'pm', reviewer: 'ad', estimate: 24, actual: 26, after: 'Бриф клиента и референсы' },
  { stage: 'Storyboard', title: 'Раскадровка: 27 шотов', assignee: 'gulnora', reviewer: 'ad', estimate: 40, actual: 44, after: 'Сценарии трёх роликов (60″ / 45″ / 30″)' },
  { stage: 'Animatic', title: 'Аниматик с черновой озвучкой', assignee: 'gulnora', reviewer: 'ad', estimate: 20, actual: 18, after: 'Раскадровка: 27 шотов' },
  { stage: 'Concept Art', title: 'Концепт: маскот «24» и стиль интерфейса', assignee: 'ad', reviewer: 'producer', estimate: 30, actual: 32, priority: 'HIGH' },
  { stage: 'Character Design', title: 'Дизайн персонажей: маскот, менеджер, клиент', assignee: 'ad', reviewer: 'producer', estimate: 28, actual: 30, after: 'Концепт: маскот «24» и стиль интерфейса' },
  { stage: 'Environment Design', title: 'Дизайн окружения: чат, панель менеджера, офис', assignee: 'gulnora', reviewer: 'ad', estimate: 24, actual: 22 },
  { stage: 'Modeling', title: 'Моделинг маскота «24»', assignee: 'bekzod', reviewer: 'ad', estimate: 36, actual: 40, priority: 'HIGH', after: 'Дизайн персонажей: маскот, менеджер, клиент' },
  { stage: 'Modeling', title: 'Моделинг смартфона Hero (high-poly)', assignee: 'bekzod', reviewer: 'ad', estimate: 24, actual: 22 },
  { stage: 'Modeling', title: 'Текстуры и материалы UI (glass / matte)', assignee: 'zilola', reviewer: 'ad', estimate: 30, actual: 31, after: 'Моделинг маскота «24»' },
  { stage: 'Rigging', title: 'Риг маскота: body + лицевой', assignee: 'sardor', reviewer: 'anna', estimate: 32, actual: 35, priority: 'HIGH', after: 'Моделинг маскота «24»' },
  { stage: 'Rigging', title: 'Риг смартфона и пузырей сообщений', assignee: 'sardor', reviewer: 'anna', estimate: 12, actual: 10 },
  { stage: 'Sound', title: 'Джингл, саунд-дизайн и озвучка UZ / RU / EN', assignee: 'dilshod', reviewer: 'pm', estimate: 40, actual: 38 },
  { stage: 'Editing', title: 'Монтаж трёх роликов', assignee: 'farrux', reviewer: 'ad', estimate: 30, actual: 28, after: 'Джингл, саунд-дизайн и озвучка UZ / RU / EN' },
  { stage: 'Internal Review', title: 'Внутренний просмотр с продюсером', assignee: 'pm', reviewer: 'producer', estimate: 4, actual: 4, after: 'Монтаж трёх роликов' },
  { stage: 'Client Review', title: 'Презентация клиенту и сбор правок', assignee: 'pm', reviewer: 'producer', estimate: 6, actual: 7, priority: 'HIGH', after: 'Внутренний просмотр с продюсером' },
  { stage: 'Corrections', title: 'Правки клиента: цвет CTA и логотип в финале', assignee: 'javohir', reviewer: 'ad', estimate: 8, actual: 6, priority: 'URGENT', after: 'Презентация клиенту и сбор правок' },
  { stage: 'Final Render', title: 'Финальный рендер 4K и мастеринг', assignee: 'sherzod', reviewer: 'pm', estimate: 16, actual: 14, priority: 'HIGH', after: 'Правки клиента: цвет CTA и логотип в финале' },
  { stage: 'Delivery', title: 'Сдача мастер-файлов и исходников', assignee: 'pm', reviewer: 'producer', estimate: 4, actual: 3, after: 'Финальный рендер 4K и мастеринг' }
]

export const PER_SCENE_TASKS = [
  { stage: 'Layout', prefix: 'Лейаут', assignee: 'marat', estimate: 12 },
  { stage: 'Animation', prefix: 'Анимация', assignee: null, estimate: 34 },
  { stage: 'Simulation / FX', prefix: 'FX: частицы и свечение', assignee: 'shohruh', estimate: 14, only: [1, 4, 7] },
  { stage: 'Lighting', prefix: 'Свет и шейдинг', assignee: 'nigora', estimate: 16 },
  { stage: 'Compositing', prefix: 'Композитинг', assignee: 'javohir', estimate: 14 }
]

export const TASK_COMMENTS = {
  'Раскадровка: 27 шотов': [['gulnora', 'Выложила первую версию раскадровки. Во второй сцене предлагаю крупный план «печатающего» маскота.'], ['ad', 'Крупный план — да. В финале камеру чуть ниже, чтобы логотип читался на смартфоне.']],
  'Концепт: маскот «24» и стиль интерфейса': [['ad', 'Три варианта маскота в задаче. Мой фаворит — второй: круглый, с «24» на груди.'], ['producer', 'Клиент выбрал второй, просят чуть теплее зелёный. Берём из брендбука #1F6F5F.']],
  'Риг маскота: body + лицевой': [['sardor', 'Риг готов, добавил контрол на «печатающий» жест пальцами.'], ['anna', 'Проверила на тестовой сцене — всё гнётся как надо.']],
  'Презентация клиенту и сбор правок': [['pm', 'Показали клиенту все три ролика. Две правки: цвет CTA фирменный и логотип в финале крупнее.']],
  'Сдача мастер-файлов и исходников': [['pm', 'Мастера переданы клиенту, акт подписан. Сдали на два дня раньше срока.'], ['owner', 'Отличная работа всей команде. Маржа выше плана.']]
}

export const ASSETS = [
  { type: 'REFERENCE', name: 'Ключевые визуалы бренда (постеры)', description: 'Постеры и key visuals 24reply.ai из брендбука.', owner: 'ad' },
  { type: 'CHARACTER', name: 'Маскот «24»', description: 'Круглый зелёный маскот с «24» на груди, «печатающий» жест.', owner: 'ad', versioned: true },
  { type: 'CHARACTER', name: 'ИИ-менеджер', description: 'Персонаж-оператор для ролика «Как это работает».', owner: 'ad' },
  { type: 'ENVIRONMENT', name: 'Интерфейс чата (3D)', description: 'Объёмный чат с пузырями сообщений.', owner: 'gulnora' },
  { type: 'ENVIRONMENT', name: 'Панель менеджера', description: 'Дашборд с диалогами и кнопкой «передать человеку».', owner: 'gulnora' },
  { type: 'PROP', name: 'Смартфон Hero', description: 'Продуктовый смартфон крупным планом, стекло и алюминий.', owner: 'bekzod', versioned: true, sources: true },
  { type: 'MODEL', name: 'Маскот «24» — high-poly', description: 'Финальная геометрия под риг и рендер.', owner: 'bekzod' },
  { type: 'TEXTURE', name: 'Материалы UI: glass / matte', description: 'Стеклянные и матовые PBR-материалы интерфейса.', owner: 'zilola' },
  { type: 'RIG', name: 'Риг маскота', description: 'Body-риг с лицевыми контролами.', owner: 'sardor', versioned: true },
  { type: 'ANIMATION', name: 'Цикл «печатает…»', description: 'Зацикленная анимация ожидания ответа.', owner: 'anna' },
  { type: 'AUDIO', name: 'Джингл 24reply', description: 'Фирменный трёхнотный джингл, 2.4 с.', owner: 'dilshod' },
  { type: 'TEMPLATE', name: 'Шаблон лоуэр-сёрда', description: 'Подписи и CTA в фирменном стиле.', owner: 'javohir' }
]

export const REWORK_NOTES = [
  'Дуга движения руки маскота рваная на кадрах 1012–1020, пауза перед ответом на 4 кадра длиннее аниматика.',
  'Пузырь сообщения появляется раньше, чем маскот заканчивает жест. Сдвинуть на 6 кадров.',
  'Слишком резкий блик на смартфоне в конце шота — притушить.'
]

export const EXPENSES = [
  ['SOFTWARE', 'Лицензии Maya + Houdini на команду, 4 месяца', 3200, 2], ['PRODUCTION', 'Съёмка референсов интерфейса и офиса клиента', 640, 8],
  ['OTHER', 'Печать раскадровки и курьер клиенту', 90, 21], ['EMPLOYEE', 'Зарплата команды за май', 11800, 27],
  ['SOFTWARE', 'Substance 3D + Nuke, доп. места', 1150, 29], ['HARDWARE', 'SSD 4 ТБ под рендер-кэш', 420, 60],
  ['EMPLOYEE', 'Зарплата команды за июнь', 14200, 57], ['FREELANCER', 'Композитор — джингл и музыкальная подложка', 2500, 77],
  ['AUDIO', 'Лицензия на звуковую библиотеку UI-звуков', 380, 79], ['EMPLOYEE', 'Зарплата команды за июль', 15600, 88],
  ['FREELANCER', 'Диктор — озвучка UZ / RU / EN', 900, 106], ['RENDER', 'Облачный рендер — основной проход', 3400, 108],
  ['EMPLOYEE', 'Зарплата команды за август', 15100, 119], ['RENDER', 'Облачный рендер — финальный 4K', 1650, 126],
  ['EMPLOYEE', 'Зарплата команды за сентябрь (до сдачи)', 4900, 127]
]

export const INVOICES = [
  { amount: 48000, issued: 1, due: 15, paid: 10 },
  { amount: 36000, issued: 92, due: 106, paid: 103 },
  { amount: 36000, issued: 127, due: 141, paid: 131 }
]

export const DOCUMENTS = [
  { pool: 'pdf', type: 'NDA', name: 'NDA — 24reply LLC × Astir Studio', uploader: 'producer', owner: 'client' },
  { pool: 'pdf', type: 'CONTRACT', name: 'Договор № 14/2026 на производство роликов', uploader: 'producer', owner: 'client' },
  { pool: 'pdf', type: 'BRIEF', name: 'Бриф клиента — запуск 24reply.ai', uploader: 'pm' },
  { pool: 'text', type: 'SPECIFICATION', name: 'Спецификация роликов (SPEC)', uploader: 'pm' },
  { pool: 'xlsx', type: 'OTHER', name: 'Смета проекта', uploader: 'finance' },
  { pool: 'pdf', type: 'INVOICE', name: 'Счёт INV-0001 — аванс 40 %', uploader: 'finance' },
  { pool: 'pdf', type: 'OTHER', name: 'Сценарий ролика 1 — Hero', uploader: 'pm', owner: 'episode:0' },
  { pool: 'pdf', type: 'OTHER', name: 'Сценарий ролика 2 — Как это работает', uploader: 'pm', owner: 'episode:1' },
  { pool: 'pdf', type: 'OTHER', name: 'Раскадровка — сцена 1', uploader: 'gulnora', owner: 'scene:0' },
  { pool: 'pdf', type: 'OTHER', name: 'Раскадровка — сцена 5', uploader: 'gulnora', owner: 'scene:4' },
  { pool: 'image', type: 'OTHER', name: 'Референс кадра EP01_SC01_SH010', uploader: 'gulnora', owner: 'shot:0' },
  { pool: 'image', type: 'OTHER', name: 'Референс кадра EP02_SC02_SH020', uploader: 'gulnora', owner: 'shot:13' },
  { pool: 'pdf', type: 'OTHER', name: 'Референсы по стилю и маскоту', uploader: 'ad', owner: 'task:Концепт: маскот «24» и стиль интерфейса' },
  { pool: 'pdf', type: 'INVOICE', name: 'Счёт INV-0002 — этап 30 %', uploader: 'finance' },
  { pool: 'pdf', type: 'INVOICE', name: 'Счёт INV-0003 — финальный платёж', uploader: 'finance' },
  { pool: 'docx', type: 'ACT', name: 'Акт приёма-передачи мастер-файлов', uploader: 'pm', owner: 'client' },
  { pool: 'csv', type: 'OTHER', name: 'Манифест мастер-файлов', uploader: 'sherzod' },
  { pool: 'pdf', type: 'OTHER', name: 'Регламент отдела анимации', uploader: 'anna', owner: 'department:Animation' }
]

/** Two more jobs in flight, so the dashboard has live work on it. */
export const SIDE_PROJECTS = [
  {
    code: 'AST-002', name: 'Nur Bank — брендовый ролик', client: 'nurbank', template: 'Commercial', projectType: 'COMMERCIAL',
    priority: 'URGENT', budget: 85000, startDay: 90, deadlineDay: 150, status: 'PRODUCTION',
    description: 'Имиджевый ролик 45″ к запуску нового мобильного приложения банка. Смешанная техника: 3D-интерфейс и 2D-персонажи.',
    doneStages: 4, currentStage: 'Animation',
    shots: 6,
    tasks: [
      { stage: 'Brief', title: 'Бриф и позиционирование', assignee: 'pm', status: 'DONE', estimate: 6 },
      { stage: 'Script', title: 'Сценарий 45″', assignee: 'pm', status: 'DONE', estimate: 16 },
      { stage: 'Storyboard', title: 'Раскадровка ролика банка', assignee: 'gulnora', status: 'DONE', estimate: 24 },
      { stage: 'Animatic', title: 'Аниматик с музыкой', assignee: 'gulnora', status: 'DONE', estimate: 12 },
      { stage: 'Animation', title: 'Анимация сцены с приложением', assignee: 'anna', status: 'IN_PROGRESS', estimate: 40, priority: 'HIGH' },
      { stage: 'Animation', title: 'Анимация персонажей у банкомата', assignee: 'marat', status: 'REVIEW', estimate: 30 },
      { stage: 'Animation', title: 'Переходы между сценами', assignee: 'anna', status: 'READY', estimate: 12 },
      { stage: 'Compositing', title: 'Композ: интерфейс приложения', assignee: 'javohir', status: 'BACKLOG', estimate: 18 },
      { stage: 'Sound', title: 'Музыка и диктор', assignee: 'dilshod', status: 'IN_PROGRESS', estimate: 20, overdue: true },
      { stage: 'Editing', title: 'Монтаж ролика', assignee: 'farrux', status: 'BACKLOG', estimate: 16 }
    ]
  },
  {
    code: 'AST-003', name: 'Bright Kids — обучающие шорты', client: 'kids', template: '2D Animation', projectType: '2D_ANIMATION',
    priority: 'NORMAL', budget: 130000, startDay: 118, deadlineDay: 240, status: 'PRE_PRODUCTION',
    description: 'Шесть 2D-роликов по 90 секунд для детского телеканала: буквы, цифры, цвета. Яркий стиль, простые формы.',
    doneStages: 2, currentStage: 'Storyboard',
    shots: 0,
    tasks: [
      { stage: 'Brief', title: 'Бриф канала и педагогические требования', assignee: 'pm', status: 'DONE', estimate: 8 },
      { stage: 'Script', title: 'Сценарии шести серий', assignee: 'pm', status: 'DONE', estimate: 30 },
      { stage: 'Storyboard', title: 'Раскадровка серии «Буквы»', assignee: 'gulnora', status: 'IN_PROGRESS', estimate: 20 },
      { stage: 'Concept Art', title: 'Персонажи: Лис, Сова, Робот', assignee: 'ad', status: 'IN_PROGRESS', estimate: 36, priority: 'HIGH' },
      { stage: 'Character Design', title: 'Листы персонажей с эмоциями', assignee: 'ad', status: 'BACKLOG', estimate: 24 }
    ]
  }
]

export const STUDIO = {
  name: 'Astir Studio',
  legalName: 'ООО «Astir Animation»',
  email: 'hello@astir.uz',
  phone: '+998 71 205 05 05',
  website: 'https://astir.uz',
  address: 'Ташкент, ул. Шота Руставели, 53, 3 этаж',
  currency: 'USD',
  timezone: 'Asia/Tashkent',
  invoicePrefix: 'INV-'
}

export const TEMPLATES = {
  '2D Animation': ['Brief', 'Script', 'Storyboard', 'Animatic', 'Concept Art', 'Character Design', 'Environment Design', 'Animation', 'Compositing', 'Sound', 'Editing', 'Internal Review', 'Client Review', 'Corrections', 'Final Render', 'Delivery'],
  '3D Animation': ['Brief', 'Script', 'Storyboard', 'Animatic', 'Concept Art', 'Character Design', 'Environment Design', 'Modeling', 'Rigging', 'Layout', 'Animation', 'Simulation / FX', 'Lighting', 'Rendering', 'Compositing', 'Sound', 'Editing', 'Internal Review', 'Client Review', 'Corrections', 'Final Render', 'Delivery'],
  'Commercial': ['Brief', 'Script', 'Storyboard', 'Animatic', 'Animation', 'Compositing', 'Sound', 'Editing', 'Internal Review', 'Client Review', 'Corrections', 'Final Render', 'Delivery'],
  'Motion Design': ['Brief', 'Script', 'Storyboard', 'Animation', 'Compositing', 'Sound', 'Editing', 'Internal Review', 'Client Review', 'Corrections', 'Delivery'],
  'Series Episode': ['Brief', 'Storyboard', 'Animatic', 'Layout', 'Animation', 'Lighting', 'Rendering', 'Compositing', 'Sound', 'Editing', 'Internal Review', 'Client Review', 'Corrections', 'Final Render', 'Delivery']
}
