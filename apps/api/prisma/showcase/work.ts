import { addDays, between, day, log, prisma } from './lib'
import type { Staff } from './people'
import type { Production } from './production'

/**
 * The work itself: tasks per stage and per scene, the dependency chain
 * between them, hours logged against them and the conversations on them.
 */
interface GeneralTask {
  stage: string
  title: string
  description?: string
  assignee: string
  reviewer: string
  estimate: number
  actual: number
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  /** Title of the task this one waits for. */
  after?: string
}

const GENERAL: readonly GeneralTask[] = [
  { stage: 'Brief', title: 'Бриф клиента и референсы', description: 'Встреча с CEO и Head of Marketing, фиксация целей запуска, сбор референсов по стилю.', assignee: 'pm', reviewer: 'producer', estimate: 6, actual: 5, priority: 'HIGH' },
  { stage: 'Script', title: 'Сценарии трёх роликов (60″ / 45″ / 30″)', description: 'Три сценария с таймингом по секундам, ключевые реплики маскота, места для CTA.', assignee: 'pm', reviewer: 'ad', estimate: 24, actual: 26, after: 'Бриф клиента и референсы' },
  { stage: 'Storyboard', title: 'Раскадровка: 27 шотов', description: 'По три шота на сцену, композиция и движение камеры, пометки для аниматика.', assignee: 'gulnora', reviewer: 'ad', estimate: 40, actual: 44, after: 'Сценарии трёх роликов (60″ / 45″ / 30″)' },
  { stage: 'Animatic', title: 'Аниматик с черновой озвучкой', description: 'Монтаж раскадровки в тайминг с временной озвучкой и джинглом.', assignee: 'gulnora', reviewer: 'ad', estimate: 20, actual: 18, after: 'Раскадровка: 27 шотов' },
  { stage: 'Concept Art', title: 'Концепт: маскот «24» и стиль интерфейса', description: 'Три варианта маскота, палитра из брендбука, стиль 3D-интерфейса чата.', assignee: 'ad', reviewer: 'producer', estimate: 30, actual: 32, priority: 'HIGH' },
  { stage: 'Character Design', title: 'Дизайн персонажей: маскот, менеджер, клиент', description: 'Финальные листы персонажей с ракурсами и выражениями.', assignee: 'ad', reviewer: 'producer', estimate: 28, actual: 30, after: 'Концепт: маскот «24» и стиль интерфейса' },
  { stage: 'Environment Design', title: 'Дизайн окружения: чат, панель менеджера, офис', assignee: 'gulnora', reviewer: 'ad', estimate: 24, actual: 22, after: 'Концепт: маскот «24» и стиль интерфейса' },
  { stage: 'Modeling', title: 'Моделинг маскота «24»', description: 'Blockout → high-poly → ретопология под риг. Готово к текстурам.', assignee: 'bekzod', reviewer: 'ad', estimate: 36, actual: 40, priority: 'HIGH', after: 'Дизайн персонажей: маскот, менеджер, клиент' },
  { stage: 'Modeling', title: 'Моделинг смартфона Hero (high-poly)', assignee: 'bekzod', reviewer: 'ad', estimate: 24, actual: 22 },
  { stage: 'Modeling', title: 'Текстуры и материалы UI (glass / matte)', assignee: 'zilola', reviewer: 'ad', estimate: 30, actual: 31, after: 'Моделинг маскота «24»' },
  { stage: 'Rigging', title: 'Риг маскота: body + лицевой', description: 'Контролы для «печатающего» жеста и мимики; тест на аниматоре.', assignee: 'sardor', reviewer: 'anna', estimate: 32, actual: 35, priority: 'HIGH', after: 'Моделинг маскота «24»' },
  { stage: 'Rigging', title: 'Риг смартфона и пузырей сообщений', assignee: 'sardor', reviewer: 'anna', estimate: 12, actual: 10, after: 'Моделинг смартфона Hero (high-poly)' },
  { stage: 'Sound', title: 'Джингл, саунд-дизайн и озвучка UZ / RU / EN', description: 'Фирменный джингл 24reply, UI-звуки, запись диктора на трёх языках.', assignee: 'dilshod', reviewer: 'pm', estimate: 40, actual: 38 },
  { stage: 'Editing', title: 'Монтаж трёх роликов', assignee: 'farrux', reviewer: 'ad', estimate: 30, actual: 28, after: 'Джингл, саунд-дизайн и озвучка UZ / RU / EN' },
  { stage: 'Internal Review', title: 'Внутренний просмотр с продюсером', assignee: 'pm', reviewer: 'producer', estimate: 4, actual: 4, after: 'Монтаж трёх роликов' },
  { stage: 'Client Review', title: 'Презентация клиенту и сбор правок', description: 'Просмотр с CEO 24reply. Две правки: цвет CTA и логотип в финале.', assignee: 'pm', reviewer: 'producer', estimate: 6, actual: 7, priority: 'HIGH', after: 'Внутренний просмотр с продюсером' },
  { stage: 'Corrections', title: 'Правки клиента: цвет CTA и логотип в финале', assignee: 'javohir', reviewer: 'ad', estimate: 8, actual: 6, priority: 'URGENT', after: 'Презентация клиенту и сбор правок' },
  { stage: 'Final Render', title: 'Финальный рендер 4K и мастеринг', description: 'ProRes 4444 4K + H.264 1080p для соцсетей, три языковые версии.', assignee: 'sherzod', reviewer: 'pm', estimate: 16, actual: 14, priority: 'HIGH', after: 'Правки клиента: цвет CTA и логотип в финале' },
  { stage: 'Delivery', title: 'Сдача мастер-файлов и исходников', assignee: 'pm', reviewer: 'producer', estimate: 4, actual: 3, after: 'Финальный рендер 4K и мастеринг' }
]

/** Per-scene work, in pipeline order; FX only where the scene needs it. */
const PER_SCENE = [
  { stage: 'Layout', prefix: 'Лейаут', assignee: 'marat', estimate: [10, 14] as const },
  { stage: 'Animation', prefix: 'Анимация', assignee: null, estimate: [28, 40] as const },
  { stage: 'Simulation / FX', prefix: 'FX: частицы и свечение', assignee: 'shohruh', estimate: [12, 16] as const, only: [1, 4, 7] },
  { stage: 'Lighting', prefix: 'Свет и шейдинг', assignee: 'nigora', estimate: [14, 18] as const },
  { stage: 'Compositing', prefix: 'Композитинг', assignee: 'javohir', estimate: [12, 16] as const }
]

const COMMENTS: Record<string, Array<[string, string]>> = {
  'Раскадровка: 27 шотов': [
    ['gulnora', 'Выложила первую версию раскадровки для ролика 1. Во второй сцене предлагаю добавить крупный план «печатающего» маскота.'],
    ['ad', 'Крупный план — да. В финале сделай камеру чуть ниже, чтобы логотип читался на смартфоне.'],
    ['gulnora', 'Поправила, финальный кадр теперь снизу вверх. Отдаю на аниматик.']
  ],
  'Концепт: маскот «24» и стиль интерфейса': [
    ['ad', 'Три варианта маскота в задаче. Мой фаворит — второй: круглый, с «24» на груди, глаза-точки.'],
    ['producer', 'Клиент выбрал второй, просят чуть теплее зелёный. Берём из брендбука #1F6F5F.']
  ],
  'Риг маскота: body + лицевой': [
    ['sardor', 'Риг готов, добавил отдельный контрол на «печатающий» жест пальцами.'],
    ['anna', 'Проверила на тестовой сцене — всё гнётся как надо. Спасибо!']
  ],
  'Джингл, саунд-дизайн и озвучка UZ / RU / EN': [
    ['dilshod', 'Диктор записан на трёх языках, узбекская версия на 2 секунды длиннее — учла монтажка?'],
    ['farrux', 'Да, в UZ-версии растянул финальную сцену на 48 кадров, тайминг сходится.']
  ],
  'Презентация клиенту и сбор правок': [
    ['pm', 'Показали клиенту все три ролика. Восторг. Две правки: цвет кнопки CTA сделать фирменным и логотип в финале крупнее.'],
    ['producer', 'Отлично. Завёл правки в системе, срок — до завтра.']
  ],
  'Правки клиента: цвет CTA и логотип в финале': [
    ['javohir', 'Обе правки внесены, рендер превью в версиях. Логотип +20%, CTA #1F6F5F.'],
    ['ad', 'Смотрел — принято. Можно в финальный рендер.']
  ],
  'Финальный рендер 4K и мастеринг': [
    ['sherzod', 'Финальный рендер прошёл за ночь на трёх нодах, все кадры на месте. Мастеринг сделал, файлы в документах проекта.']
  ],
  'Сдача мастер-файлов и исходников': [
    ['pm', 'Мастера переданы клиенту, акт подписан. Сдали на два дня раньше срока 🎉'],
    ['owner', 'Отличная работа всей команде. Бюджет уложился, маржа выше плана.']
  ]
}

export interface TaskRef {
  id: string
  title: string
  stage: string
  assigneeKey: string
  reviewerKey: string
  start: Date
  deadline: Date
  sceneIndex: number | null
}

function isWeekend(date: Date) {
  const weekday = date.getDay()
  return weekday === 0 || weekday === 6
}

export async function seedWork(staff: Staff, production: Production) {
  const pm = staff.pm!
  const tasks: TaskRef[] = []
  const byTitle = new Map<string, string>()

  async function createTask(input: {
    title: string
    description?: string
    stage: string
    assigneeKey: string
    reviewerKey: string
    estimate: number
    actual: number
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
    from: number
    to: number
    sceneIndex: number | null
  }) {
    const stage = production.stage(input.stage)
    const scene = input.sceneIndex === null ? null : production.scenes[input.sceneIndex] ?? null
    const start = day(input.from, 9, 30)
    const deadline = day(input.to, 18)
    const row = await prisma.task.create({
      data: {
        projectId: production.projectId,
        episodeId: scene?.episodeId ?? null,
        sceneId: scene?.id ?? null,
        stageId: stage.id,
        title: input.title,
        description: input.description ?? null,
        status: 'DONE',
        priority: input.priority,
        assigneeId: staff[input.assigneeKey]?.userId ?? null,
        reviewerId: staff[input.reviewerKey]?.userId ?? null,
        estimatedHours: input.estimate,
        actualHours: input.actual,
        startDate: start,
        deadline,
        createdById: pm.userId,
        createdAt: addDays(start, -3),
        updatedAt: deadline
      }
    })
    const ref: TaskRef = {
      id: row.id, title: input.title, stage: input.stage, assigneeKey: input.assigneeKey,
      reviewerKey: input.reviewerKey, start, deadline, sceneIndex: input.sceneIndex
    }
    tasks.push(ref)
    byTitle.set(input.title, row.id)
    return ref
  }

  // Stage-level tasks, plus the chain between them.
  for (const seed of GENERAL) {
    const stage = production.stage(seed.stage)
    await createTask({
      ...seed,
      assigneeKey: seed.assignee,
      reviewerKey: seed.reviewer,
      priority: seed.priority ?? 'NORMAL',
      from: stage.from,
      to: stage.to,
      sceneIndex: null
    })
  }
  for (const seed of GENERAL) {
    if (!seed.after) continue
    const taskId = byTitle.get(seed.title)
    const dependsOnTaskId = byTitle.get(seed.after)
    if (taskId && dependsOnTaskId) {
      await prisma.taskDependency.create({ data: { taskId, dependsOnTaskId } })
    }
  }

  // Scene-level tasks, staggered across each stage window and chained
  // layout → animation → fx → lighting → compositing within the scene.
  const sceneCount = production.scenes.length
  for (const scene of production.scenes) {
    let previous: string | null = null
    for (const seed of PER_SCENE) {
      if (seed.only && !seed.only.includes(scene.index)) continue
      const stage = production.stage(seed.stage)
      const span = stage.to - stage.from
      const from = stage.from + Math.floor(span * 0.6 * scene.index / sceneCount)
      const to = from + Math.ceil(span * 0.35)
      const shot = production.shots.find(s => s.sceneIndex === scene.index)
      const assigneeKey = seed.assignee ?? shot?.assigneeKey ?? 'anna'
      const estimate = between(seed.estimate[0], seed.estimate[1])
      const ref = await createTask({
        title: seed.prefix + ': «' + scene.name + '»',
        stage: seed.stage,
        assigneeKey,
        reviewerKey: seed.stage === 'Animation' ? 'ad' : 'marat',
        estimate,
        actual: estimate + between(-3, 4),
        priority: seed.stage === 'Animation' ? 'HIGH' : 'NORMAL',
        from,
        to,
        sceneIndex: scene.index
      })
      if (previous) {
        await prisma.taskDependency.create({ data: { taskId: ref.id, dependsOnTaskId: previous } })
      }
      previous = ref.id
    }
  }

  // Hours: each task's actual time spread over workdays inside its window.
  let entries = 0
  for (const task of tasks) {
    const person = staff[task.assigneeKey]
    if (!person?.employeeId) continue
    const actual = Number(
      (await prisma.task.findUnique({ where: { id: task.id }, select: { actualHours: true } }))?.actualHours ?? 0
    )
    let remaining = actual
    let date = new Date(task.start)
    while (remaining > 0 && date <= task.deadline) {
      if (!isWeekend(date)) {
        const hours = Math.min(remaining, between(3, 8))
        await prisma.timesheetEntry.create({
          data: {
            employeeId: person.employeeId,
            projectId: production.projectId,
            taskId: task.id,
            date: new Date(date),
            hours,
            description: task.title,
            createdAt: new Date(date)
          }
        })
        remaining -= hours
        entries += 1
      }
      date = addDays(date, 1)
    }
  }
  // Coordination time that never sits on a task.
  for (let offset = 0; offset <= 127; offset += 1) {
    const date = day(offset, 9)
    const weekday = date.getDay()
    if (weekday === 1 || weekday === 4) {
      await prisma.timesheetEntry.create({
        data: {
          employeeId: pm.employeeId!,
          projectId: production.projectId,
          date,
          hours: 3,
          description: 'Координация команды, статусы, созвон с клиентом',
          createdAt: date
        }
      })
      entries += 1
    }
    if (weekday === 5 && staff.producer?.employeeId) {
      await prisma.timesheetEntry.create({
        data: {
          employeeId: staff.producer.employeeId,
          projectId: production.projectId,
          date,
          hours: 2,
          description: 'Еженедельный контроль бюджета и сроков',
          createdAt: date
        }
      })
      entries += 1
    }
  }

  // Conversations on the tasks people actually talked about.
  let comments = 0
  for (const task of tasks) {
    const thread = COMMENTS[task.title]
    if (!thread) continue
    for (const [index, [author, message]] of thread.entries()) {
      const person = staff[author]
      if (!person) continue
      await prisma.comment.create({
        data: {
          userId: person.userId,
          entityType: 'Task',
          entityId: task.id,
          message,
          createdAt: addDays(task.start, Math.min(index + 1, 3))
        }
      })
      comments += 1
    }
  }

  log('tasks: ' + tasks.length + ', timesheet entries: ' + entries + ', comments: ' + comments)
  return tasks
}
