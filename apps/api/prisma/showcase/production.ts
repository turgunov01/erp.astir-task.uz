import { DEFAULT_PIPELINE, PROJECT_TEMPLATES } from '@astir/config'
import { attachNext } from './media'
import { day, log, prisma, PROJECT_CODE } from './lib'
import { DEPARTMENT_LEAD, type ClientInfo, type Staff } from './people'

/**
 * One project taken from the brief to the delivered masters.
 *
 * Every date is a day offset from START (the brief meeting). The stage
 * windows overlap the way a real schedule does: concept art starts while
 * the script is still being polished, sound runs alongside lighting.
 */
export const STAGE_WINDOWS: Record<string, [number, number]> = {
  'Brief': [0, 4],
  'Script': [3, 12],
  'Storyboard': [10, 22],
  'Animatic': [20, 28],
  'Concept Art': [14, 30],
  'Character Design': [22, 38],
  'Environment Design': [26, 42],
  'Modeling': [34, 56],
  'Rigging': [46, 62],
  'Layout': [52, 66],
  'Animation': [60, 92],
  'Simulation / FX': [78, 98],
  'Lighting': [84, 104],
  'Rendering': [92, 110],
  'Compositing': [98, 114],
  'Sound': [90, 112],
  'Editing': [106, 116],
  'Internal Review': [114, 117],
  'Client Review': [117, 121],
  'Corrections': [120, 124],
  'Final Render': [123, 126],
  'Delivery': [126, 127]
}

/** The day the masters were handed over; the deadline was two days later. */
export const DONE_DAY = 127
export const DEADLINE_DAY = 129

const EPISODES = [
  {
    number: 1,
    title: 'Ролик 1 — Hero: «Скорость ответа»',
    description: 'Главный имиджевый ролик 60″: клиент пишет ночью, маскот «24» отвечает за секунды.',
    duration: 60,
    scenes: ['Открытие — клиент пишет ночью', 'Маскот «24» отвечает за секунды', 'Финал — логотип и слоган']
  },
  {
    number: 2,
    title: 'Ролик 2 — «Как это работает»',
    description: 'Объясняющий ролик 45″: подключение к мессенджерам, панель менеджера, передача сложного вопроса человеку.',
    duration: 45,
    scenes: ['Подключение к мессенджерам', 'Панель менеджера и чат', 'Передача вопроса человеку']
  },
  {
    number: 3,
    title: 'Ролик 3 — «Бот vs ИИ-менеджер»',
    description: 'Сравнительный ролик 30″: старый скриптовый бот теряет клиента, ИИ-менеджер закрывает сделку.',
    duration: 30,
    scenes: ['Старый бот теряет клиента', 'ИИ-менеджер закрывает сделку', 'Сравнение и призыв']
  }
]

const SHOT_NAMES = ['Общий план', 'Средний план', 'Крупный план / деталь интерфейса']

export interface StageRef {
  id: string
  name: string
  order: number
  weight: number
  from: number
  to: number
  assigneeKey: string
}

export interface ShotRef {
  id: string
  code: string
  index: number
  episodeId: string
  sceneId: string
  sceneIndex: number
  assigneeKey: string
  startFrame: number
  endFrame: number
}

export interface Production {
  projectId: string
  clientId: string
  stages: StageRef[]
  stage: (name: string) => StageRef
  episodes: Array<{ id: string, number: number, title: string }>
  scenes: Array<{ id: string, episodeId: string, index: number, name: string }>
  shots: ShotRef[]
}

function shotAssignee(index: number): string {
  return ['anna', 'anna', 'marat'][index % 3] as string
}

export async function seedProduction(staff: Staff, client: ClientInfo): Promise<Production> {
  const pm = staff.pm!
  const producer = staff.producer!

  const project = await prisma.project.create({
    data: {
      code: PROJECT_CODE,
      name: '24reply.ai — продуктовые ролики',
      description:
        'Серия из трёх продуктовых роликов для AI-ассистента 24reply.ai к запуску: hero-ролик 60″, ' +
        'объясняющий ролик «Как это работает» 45″ и сравнительный «Бот vs ИИ-менеджер» 30″. ' +
        '3D-маскот, моушн-графика интерфейса, озвучка на трёх языках (UZ/RU/EN). Сдано на два дня раньше срока.',
      clientId: client.id,
      projectManagerId: pm.userId,
      producerId: producer.userId,
      projectType: 'COMMERCIAL',
      status: 'COMPLETED',
      priority: 'HIGH',
      startDate: day(0),
      deadline: day(DEADLINE_DAY),
      progress: 100,
      risk: 'LOW',
      budget: 120000,
      currency: 'USD',
      createdAt: day(-6, 15, 20),
      updatedAt: day(DONE_DAY, 18, 5)
    }
  })

  // Pipeline: the 3D template, every stage closed inside its window.
  const departments = await prisma.department.findMany({ select: { id: true, name: true } })
  const departmentId = new Map(departments.map(d => [d.name, d.id]))
  const names = PROJECT_TEMPLATES['3D Animation'] ?? []
  const template = DEFAULT_PIPELINE.filter(stage => names.includes(stage.name))

  const stages: StageRef[] = []
  let previousId: string | null = null
  for (const [index, stage] of template.entries()) {
    const [from, to] = STAGE_WINDOWS[stage.name] ?? [0, 1]
    const assigneeKey = DEPARTMENT_LEAD[stage.department ?? 'Production'] ?? 'pm'
    const row: { id: string } = await prisma.projectStage.create({
      select: { id: true },
      data: {
        projectId: project.id,
        name: stage.name,
        order: index + 1,
        weight: stage.weight,
        status: 'DONE',
        progress: 100,
        startDate: day(from),
        deadline: day(to, 18),
        assigneeId: staff[assigneeKey]?.userId ?? null,
        departmentId: stage.department ? departmentId.get(stage.department) ?? null : null,
        dependencyStageId: previousId,
        createdAt: day(-5, 10, index),
        updatedAt: day(to, 17)
      }
    })
    previousId = row.id
    stages.push({ id: row.id, name: stage.name, order: index + 1, weight: stage.weight, from, to, assigneeKey })
  }

  const milestones: Array<[string, number, number, string]> = [
    ['Бриф и КП утверждены', 4, 4, 'Клиент подтвердил объём: три ролика, 3D-маскот, три языка озвучки.'],
    ['Сценарий и раскадровка утверждены', 24, 22, 'Все три сценария и раскадровки согласованы с Head of Marketing.'],
    ['Аниматик утверждён клиентом', 30, 28, 'Тайминг и монтажный ритм зафиксированы.'],
    ['Ассеты готовы: модели и риги', 64, 62, 'Маскот, смартфон и интерфейсы смоделированы и заригованы.'],
    ['Анимация завершена', 94, 92, 'Все 27 шотов прошли внутреннее ревью анимации.'],
    ['Клиент утвердил финальную версию', 122, 121, 'Финальный просмотр с CEO, две мелкие правки закрыты в тот же день.'],
    ['Мастер-файлы сданы', DEADLINE_DAY, DONE_DAY, '4K ProRes + H.264 для соцсетей, версии UZ/RU/EN, исходники.']
  ]
  for (const [index, [name, due, done, description]] of milestones.entries()) {
    await prisma.milestone.create({
      data: {
        projectId: project.id,
        name,
        description,
        order: index + 1,
        dueDate: day(due, 18),
        completedAt: day(done, 16, 30),
        createdAt: day(-5, 11)
      }
    })
  }

  // Team roster: everyone but the owner works on the project.
  for (const person of Object.values(staff)) {
    if (person.key === 'owner') continue
    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: person.userId,
        roleLabel: person.position,
        createdAt: day(person.key === 'pm' || person.key === 'producer' ? -5 : 1, 11)
      }
    })
  }

  // Episodes, scenes and shots.
  const episodes: Production['episodes'] = []
  const scenes: Production['scenes'] = []
  const shots: ShotRef[] = []
  let shotIndex = 0
  let sceneIndex = 0

  for (const episodeSeed of EPISODES) {
    const episode = await prisma.episode.create({
      data: {
        projectId: project.id,
        number: episodeSeed.number,
        title: episodeSeed.title,
        description: episodeSeed.description,
        duration: episodeSeed.duration,
        status: 'COMPLETED',
        progress: 100,
        startDate: day(10 + episodeSeed.number * 2),
        deadline: day(116 + episodeSeed.number),
        createdAt: day(9, 14, episodeSeed.number * 5)
      }
    })
    episodes.push({ id: episode.id, number: episode.number, title: episode.title })

    for (const [sceneOffset, sceneName] of episodeSeed.scenes.entries()) {
      const scene = await prisma.scene.create({
        data: {
          projectId: project.id,
          episodeId: episode.id,
          sceneNumber: sceneOffset + 1,
          name: sceneName,
          description: 'Сцена ' + (sceneOffset + 1) + ' ролика «' + episodeSeed.title + '».',
          duration: Math.round(episodeSeed.duration / 3),
          status: 'COMPLETED',
          progress: 100,
          createdAt: day(11, 10, sceneIndex * 3)
        }
      })
      scenes.push({ id: scene.id, episodeId: episode.id, index: sceneIndex, name: sceneName })

      let frame = 1001
      for (let shotOffset = 0; shotOffset < 3; shotOffset += 1) {
        const durationSeconds = 2 + ((shotIndex * 7) % 3)
        const frames = durationSeconds * 24
        const code = 'EP' + String(episodeSeed.number).padStart(2, '0') +
          '_SC' + String(sceneOffset + 1).padStart(2, '0') +
          '_SH' + String((shotOffset + 1) * 10).padStart(3, '0')
        const assigneeKey = shotAssignee(shotIndex)
        const shot = await prisma.shot.create({
          data: {
            projectId: project.id,
            episodeId: episode.id,
            sceneId: scene.id,
            shotNumber: (shotOffset + 1) * 10,
            code,
            name: SHOT_NAMES[shotOffset],
            description: sceneName + ' — ' + SHOT_NAMES[shotOffset]?.toLowerCase(),
            duration: durationSeconds,
            fps: 24,
            startFrame: frame,
            endFrame: frame + frames - 1,
            status: 'COMPLETED',
            progress: 100,
            assigneeId: staff[assigneeKey]?.userId ?? null,
            deadline: day(100 + Math.floor(shotIndex / 2), 18),
            createdAt: day(12, 10, shotIndex)
          }
        })
        shots.push({
          id: shot.id, code, index: shotIndex, episodeId: episode.id, sceneId: scene.id,
          sceneIndex, assigneeKey, startFrame: frame, endFrame: frame + frames - 1
        })

        // The per-shot pipeline, each stage closed inside its project window.
        const total = 27
        await prisma.shotStage.createMany({
          data: stages.map(stage => {
            const span = stage.to - stage.from
            const lag = Math.floor(span * 0.6 * shotIndex / total)
            return {
              shotId: shot.id,
              stageId: stage.id,
              status: 'DONE' as const,
              progress: 100,
              assigneeId: staff[stage.assigneeKey]?.userId ?? null,
              startedAt: day(stage.from + lag, 9 + (shotIndex % 3)),
              completedAt: day(stage.from + lag + Math.floor(span * 0.35), 17, shotIndex),
              deadline: day(stage.to, 18),
              createdAt: day(12, 10, shotIndex)
            }
          })
        })

        // A reference frame from the storyboard on every third shot.
        if (shotIndex % 3 === 0) {
          const reference = await attachNext('image', 'projects/' + project.id, 'reference_' + code)
          if (reference) {
            await prisma.document.create({
              data: {
                projectId: project.id,
                shotId: shot.id,
                type: 'OTHER',
                name: 'Референс кадра ' + code + reference.name.slice(reference.name.lastIndexOf('.')),
                fileUrl: reference.url,
                fileSize: BigInt(reference.size),
                mimeType: reference.mimeType,
                uploadedById: staff.gulnora?.userId ?? null,
                createdAt: day(21, 15, shotIndex)
              }
            })
          }
        }

        frame += frames
        shotIndex += 1
      }
      sceneIndex += 1
    }
  }

  log('project ' + PROJECT_CODE + ': ' + stages.length + ' stages, ' + milestones.length + ' milestones, ' +
    episodes.length + ' episodes, ' + scenes.length + ' scenes, ' + shots.length + ' shots')

  return {
    projectId: project.id,
    clientId: client.id,
    stages,
    stage: name => {
      const found = stages.find(s => s.name === name)
      if (!found) throw new Error('Stage not in template: ' + name)
      return found
    },
    episodes,
    scenes,
    shots
  }
}
