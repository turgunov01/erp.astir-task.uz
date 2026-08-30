import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { DEFAULT_PIPELINE, PROJECT_TEMPLATES } from '@astir/config'

/**
 * Demo dataset (spec 73, 74).
 *
 * Additive and re-runnable: everything is keyed on a stable natural key, so a
 * second run updates rather than duplicating. Randomness is seeded from a
 * counter instead of Math.random so two runs produce the same shape.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const DEV_PASSWORD = 'admin123'

let seedCounter = 0
/** Deterministic pseudo-random in [0,1) so reruns stay comparable. */
function rnd(): number {
  seedCounter += 1
  const x = Math.sin(seedCounter * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)] as T
}
function chance(p: number): boolean {
  return rnd() < p
}
function daysFromNow(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(12, 0, 0, 0)
  return date
}

const EXTRA_STAFF = [
  { email: 'marat@aster.studio', firstName: 'Marat', lastName: 'Yuldashev', role: 'ARTIST', position: 'Layout Artist', department: '3D', rate: 24 },
  { email: 'gulnora@aster.studio', firstName: 'Gulnora', lastName: 'Akhmedova', role: 'ARTIST', position: 'Storyboard Artist', department: '2D', rate: 25 },
  { email: 'shohruh@aster.studio', firstName: 'Shohruh', lastName: 'Nazarov', role: 'ARTIST', position: 'FX Artist', department: '3D', rate: 30 },
  { email: 'zilola@aster.studio', firstName: 'Zilola', lastName: 'Umarova', role: 'ARTIST', position: 'Texture Artist', department: 'Modeling', rate: 23 },
  { email: 'farrux@aster.studio', firstName: 'Farrux', lastName: 'Sobirov', role: 'ARTIST', position: 'Editor', department: 'Editing', rate: 26 },
  { email: 'dilshod@aster.studio', firstName: 'Dilshod', lastName: 'Rustamov', role: 'ARTIST', position: 'Sound Designer', department: 'Sound', rate: 27 },
  { email: 'lola@aster.studio', firstName: 'Lola', lastName: 'Yusupova', role: 'PROJECT_MANAGER', position: 'Project Manager', department: 'Production', rate: 34 },
  { email: 'islom@aster.studio', firstName: 'Islom', lastName: 'Tashkentov', role: 'ART_DIRECTOR', position: 'Art Director', department: '3D', rate: 42 },
  { email: 'sevara@aster.studio', firstName: 'Sevara', lastName: 'Kamalova', role: 'ARTIST', position: 'Lighting TD', department: 'Lighting', rate: 29 }
] as const

const EXTRA_CLIENTS = [
  { name: 'Tashkent Media Group', companyName: 'TMG Holding', email: 'info@tmg.uz', country: 'Uzbekistan' },
  { name: 'Amber Pictures', companyName: 'Amber Pictures Ltd', email: 'hello@amberpictures.co.uk', country: 'United Kingdom' }
] as const

interface ProjectSeed {
  code: string
  name: string
  template: string
  type: string
  status: string
  priority: string
  budget: number
  startOffset: number
  deadlineOffset: number
}

const PROJECTS: ProjectSeed[] = [
  { code: 'AST-010', name: 'Silk Road Legends — Season 1', template: '3D Animation', type: 'SERIES', status: 'PRODUCTION', priority: 'HIGH', budget: 420000, startOffset: -120, deadlineOffset: 90 },
  { code: 'AST-011', name: 'Nur Bank — Brand Film', template: 'Commercial', type: 'COMMERCIAL', status: 'POST_PRODUCTION', priority: 'URGENT', budget: 85000, startOffset: -60, deadlineOffset: 14 },
  { code: 'AST-012', name: 'Bright Kids — Learning Shorts', template: '2D Animation', type: 'SHORT_FILM', status: 'CLIENT_REVIEW', priority: 'NORMAL', budget: 130000, startOffset: -95, deadlineOffset: 30 },
  { code: 'AST-013', name: 'Amber — Title Sequence', template: 'Motion Design', type: 'MOTION_DESIGN', status: 'PRE_PRODUCTION', priority: 'NORMAL', budget: 46000, startOffset: -20, deadlineOffset: 65 },
  { code: 'AST-014', name: 'TMG — Documentary Opener', template: 'Commercial', type: 'OTHER', status: 'COMPLETED', priority: 'LOW', budget: 32000, startOffset: -210, deadlineOffset: -30 }
]

async function seedPeopleAndClients() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12)
  const departments = await prisma.department.findMany({ select: { id: true, name: true } })
  const byName = new Map(departments.map(d => [d.name, d.id]))

  for (const person of EXTRA_STAFF) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: { firstName: person.firstName, lastName: person.lastName, role: person.role as never },
      create: {
        email: person.email,
        passwordHash,
        firstName: person.firstName,
        lastName: person.lastName,
        role: person.role as never
      }
    })
    await prisma.employee.upsert({
      where: { userId: user.id },
      update: { position: person.position },
      create: {
        userId: user.id,
        departmentId: byName.get(person.department) ?? null,
        position: person.position,
        employmentType: 'FULL_TIME',
        hourlyRate: person.rate,
        weeklyCapacityHours: 40,
        status: 'ACTIVE'
      }
    })
  }

  for (const client of EXTRA_CLIENTS) {
    const existing = await prisma.client.findFirst({ where: { name: client.name } })
    if (!existing) await prisma.client.create({ data: { ...client, status: 'ACTIVE' } })
  }

  const staff = await prisma.employee.findMany({
    include: { user: { select: { id: true, role: true, firstName: true, lastName: true } } }
  })
  const clients = await prisma.client.findMany({ where: { deletedAt: null } })
  console.log('  staff: ' + staff.length + ', clients: ' + clients.length)
  return { staff, clients }
}

export { prisma, rnd, pick, chance, daysFromNow, PROJECTS, seedPeopleAndClients }

async function seedProjects(
  staff: Awaited<ReturnType<typeof seedPeopleAndClients>>['staff'],
  clients: Awaited<ReturnType<typeof seedPeopleAndClients>>['clients']
) {
  const managers = staff.filter(s => ['PROJECT_MANAGER', 'PRODUCER'].includes(s.user.role))
  const departments = await prisma.department.findMany({ select: { id: true, name: true } })
  const byName = new Map(departments.map(d => [d.name, d.id]))

  const created: Array<{ id: string, code: string, status: string }> = []

  for (const [index, seed] of PROJECTS.entries()) {
    const client = clients[index % clients.length]
    if (!client) continue

    const existing = await prisma.project.findUnique({ where: { code: seed.code } })
    const project = existing ?? (await prisma.project.create({
      data: {
        code: seed.code,
        name: seed.name,
        description: 'Демонстрационный проект студии. Полный производственный цикл от брифа до поставки.',
        clientId: client.id,
        projectManagerId: managers[index % Math.max(managers.length, 1)]?.userId ?? null,
        projectType: (seed.type === '3D_ANIMATION' ? 'ANIMATION_3D' : seed.type) as never,
        status: seed.status as never,
        priority: seed.priority as never,
        startDate: daysFromNow(seed.startOffset),
        deadline: daysFromNow(seed.deadlineOffset),
        budget: seed.budget,
        currency: 'USD'
      }
    }))

    // Pipeline from the template, only when the project has none yet.
    const stageCount = await prisma.projectStage.count({ where: { projectId: project.id } })
    if (stageCount === 0) {
      const names = PROJECT_TEMPLATES[seed.template] ?? []
      const stages = DEFAULT_PIPELINE.filter(stage => names.includes(stage.name))
      await prisma.projectStage.createMany({
        data: stages.map((stage, order) => ({
          projectId: project.id,
          name: stage.name,
          order: order + 1,
          weight: stage.weight,
          departmentId: stage.department ? byName.get(stage.department) ?? null : null
        }))
      })
    }

    // Progress the pipeline to a point that matches the project status.
    const stages = await prisma.projectStage.findMany({
      where: { projectId: project.id },
      orderBy: { order: 'asc' }
    })
    const doneRatio =
      seed.status === 'COMPLETED' ? 1
        : seed.status === 'CLIENT_REVIEW' ? 0.8
          : seed.status === 'POST_PRODUCTION' ? 0.7
            : seed.status === 'PRODUCTION' ? 0.45
              : 0.15

    const doneUntil = Math.floor(stages.length * doneRatio)
    for (const [position, stage] of stages.entries()) {
      const status = position < doneUntil ? 'DONE'
        : position === doneUntil ? 'IN_PROGRESS'
          : position === doneUntil + 1 ? 'READY'
            : 'NOT_STARTED'
      const progress = status === 'DONE' ? 100 : status === 'IN_PROGRESS' ? Math.floor(rnd() * 70) + 15 : 0
      await prisma.projectStage.update({
        where: { id: stage.id },
        data: {
          status: status as never,
          progress,
          assigneeId: chance(0.6) ? pick(staff).userId : null,
          startDate: status === 'NOT_STARTED' ? null : daysFromNow(seed.startOffset + position * 4),
          deadline: daysFromNow(seed.startOffset + (position + 1) * 6)
        }
      })
    }

    await prisma.projectBudget.upsert({
      where: { projectId: project.id },
      update: {},
      create: {
        projectId: project.id,
        revenue: seed.budget,
        plannedCost: Math.round(seed.budget * 0.68),
        actualCost: Math.round(seed.budget * doneRatio * 0.72),
        currency: 'USD'
      }
    })

    // Team roster
    const members = staff.slice(index, index + 5)
    for (const member of members) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: member.userId } },
        update: {},
        create: {
          projectId: project.id,
          userId: member.userId,
          roleLabel: member.position
        }
      })
    }

    // Milestones
    const milestoneCount = await prisma.milestone.count({ where: { projectId: project.id } })
    if (milestoneCount === 0) {
      const names = ['Script Approved', 'Animatic Approved', 'Animation Complete', 'Final Client Approval', 'Delivery']
      await prisma.milestone.createMany({
        data: names.map((name, order) => ({
          projectId: project.id,
          name,
          order: order + 1,
          dueDate: daysFromNow(seed.startOffset + (order + 1) * 25),
          completedAt: order < Math.floor(names.length * doneRatio) ? daysFromNow(seed.startOffset + (order + 1) * 24) : null
        }))
      })
    }

    created.push({ id: project.id, code: project.code, status: seed.status })
  }

  console.log('  projects: ' + created.length)
  return created
}

export { seedProjects }

const SCENE_NAMES = [
  'Пролог', 'Караван в пустыне', 'Базар', 'Ночная погоня', 'Встреча у колодца',
  'Горный перевал', 'Разговор у костра', 'Буря', 'Древний город', 'Финальный бой',
  'Прощание', 'Возвращение домой', 'Флешбэк', 'Сон героя', 'Эпилог'
]

const PRODUCTION_STATES = ['NOT_STARTED', 'IN_PROGRESS', 'REVIEW', 'REVISION', 'APPROVED', 'COMPLETED'] as const

/** Episodes, scenes and shots for the series project, plus shot stages. */
async function seedProduction(
  projects: Array<{ id: string, code: string, status: string }>,
  staff: Awaited<ReturnType<typeof seedPeopleAndClients>>['staff']
) {
  const series = projects.find(p => p.code === 'AST-010')
  if (!series) return { episodes: 0, scenes: 0, shots: 0 }

  const stages = await prisma.projectStage.findMany({
    where: { projectId: series.id },
    orderBy: { order: 'asc' },
    select: { id: true, weight: true }
  })

  let episodeCount = 0
  let sceneCount = 0
  let shotCount = 0

  for (let episodeNumber = 1; episodeNumber <= 3; episodeNumber += 1) {
    const existingEpisode = await prisma.episode.findFirst({
      where: { projectId: series.id, number: episodeNumber }
    })
    const episode = existingEpisode ?? (await prisma.episode.create({
      data: {
        projectId: series.id,
        number: episodeNumber,
        title: 'Эпизод ' + episodeNumber,
        description: 'Демонстрационный эпизод сериала.',
        duration: 660,
        status: (episodeNumber === 1 ? 'IN_PROGRESS' : episodeNumber === 2 ? 'IN_PROGRESS' : 'NOT_STARTED') as never,
        startDate: daysFromNow(-110 + episodeNumber * 20),
        deadline: daysFromNow(10 + episodeNumber * 25)
      }
    }))
    episodeCount += 1

    for (let sceneIndex = 0; sceneIndex < 5; sceneIndex += 1) {
      const sceneNumber = sceneIndex + 1
      const existingScene = await prisma.scene.findFirst({
        where: { episodeId: episode.id, sceneNumber }
      })
      const scene = existingScene ?? (await prisma.scene.create({
        data: {
          projectId: series.id,
          episodeId: episode.id,
          sceneNumber,
          name: SCENE_NAMES[(episodeNumber - 1) * 5 + sceneIndex] ?? 'Сцена ' + sceneNumber,
          duration: 90 + Math.floor(rnd() * 120),
          status: pick(PRODUCTION_STATES) as never
        }
      }))
      sceneCount += 1

      const shotsPerScene = 4
      for (let shotIndex = 0; shotIndex < shotsPerScene; shotIndex += 1) {
        const shotNumber = shotIndex + 1
        const code = 'EP' + String(episodeNumber).padStart(2, '0') +
          '_SC' + String(sceneNumber).padStart(2, '0') +
          '_SH' + String(shotNumber).padStart(3, '0')

        const existingShot = await prisma.shot.findFirst({
          where: { projectId: series.id, code }
        })
        if (existingShot) { shotCount += 1; continue }

        const startFrame = 1001 + shotIndex * 120
        const shot = await prisma.shot.create({
          data: {
            projectId: series.id,
            episodeId: episode.id,
            sceneId: scene.id,
            shotNumber,
            code,
            name: 'Shot ' + shotNumber,
            fps: 24,
            startFrame,
            endFrame: startFrame + 60 + Math.floor(rnd() * 90),
            duration: 4 + Math.floor(rnd() * 6),
            status: pick(PRODUCTION_STATES) as never,
            assigneeId: chance(0.75) ? pick(staff).userId : null,
            deadline: daysFromNow(-20 + shotIndex * 9 + episodeNumber * 15)
          }
        })
        shotCount += 1

        // Per-shot pipeline rows, progressed to a plausible point.
        const cutoff = Math.floor(stages.length * (0.15 + rnd() * 0.6))
        let weighted = 0
        let totalWeight = 0
        const rows = stages.map((stage, position) => {
          const status = position < cutoff ? 'DONE'
            : position === cutoff ? 'IN_PROGRESS'
              : 'NOT_STARTED'
          const progress = status === 'DONE' ? 100 : status === 'IN_PROGRESS' ? Math.floor(rnd() * 80) + 10 : 0
          const weight = stage.weight > 0 ? stage.weight : 1
          weighted += progress * weight
          totalWeight += weight
          return {
            shotId: shot.id,
            stageId: stage.id,
            status: status as never,
            progress,
            assigneeId: status === 'NOT_STARTED' ? null : (chance(0.7) ? pick(staff).userId : null),
            startedAt: status === 'NOT_STARTED' ? null : daysFromNow(-40 + position * 2),
            completedAt: status === 'DONE' ? daysFromNow(-38 + position * 2) : null
          }
        })
        await prisma.shotStage.createMany({ data: rows })

        await prisma.shot.update({
          where: { id: shot.id },
          data: { progress: totalWeight === 0 ? 0 : Math.round(weighted / totalWeight) }
        })
      }

      // Scene progress from its shots.
      const sceneShots = await prisma.shot.findMany({
        where: { sceneId: scene.id },
        select: { progress: true }
      })
      if (sceneShots.length > 0) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: {
            progress: Math.round(
              sceneShots.reduce((sum, item) => sum + item.progress, 0) / sceneShots.length
            )
          }
        })
      }
    }

    const episodeScenes = await prisma.scene.findMany({
      where: { episodeId: episode.id },
      select: { progress: true }
    })
    if (episodeScenes.length > 0) {
      await prisma.episode.update({
        where: { id: episode.id },
        data: {
          progress: Math.round(
            episodeScenes.reduce((sum, item) => sum + item.progress, 0) / episodeScenes.length
          )
        }
      })
    }
  }

  console.log('  episodes: ' + episodeCount + ', scenes: ' + sceneCount + ', shots: ' + shotCount)
  return { episodes: episodeCount, scenes: sceneCount, shots: shotCount }
}

export { seedProduction }

const TASK_TITLES = [
  'Блокинг анимации', 'Финальная анимация', 'Ретопология модели', 'Развёртка UV',
  'Текстурирование', 'Риг персонажа', 'Настройка света', 'Симуляция ткани',
  'Композитинг', 'Цветокоррекция', 'Рендер превью', 'Правки по ревью',
  'Раскадровка', 'Аниматик', 'Дизайн окружения', 'Звуковой дизайн',
  'Монтаж эпизода', 'Финальный рендер', 'Подготовка к сдаче', 'Проверка тайминга'
]

const TASK_STATES = ['BACKLOG', 'READY', 'IN_PROGRESS', 'REVIEW', 'REVISION', 'APPROVED', 'DONE'] as const
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

async function seedTasks(
  projects: Array<{ id: string, code: string }>,
  staff: Awaited<ReturnType<typeof seedPeopleAndClients>>['staff']
) {
  const existing = await prisma.task.count({ where: { deletedAt: null } })
  if (existing >= 90) {
    console.log('  tasks: already ' + existing + ', skipped')
    return
  }

  let created = 0
  for (const project of projects) {
    const stages = await prisma.projectStage.findMany({
      where: { projectId: project.id },
      select: { id: true }
    })
    const shots = await prisma.shot.findMany({
      where: { projectId: project.id, deletedAt: null },
      select: { id: true, episodeId: true, sceneId: true }
    })

    const target = project.code === 'AST-010' ? 44 : 14
    for (let index = 0; index < target; index += 1) {
      const shot = shots.length > 0 && chance(0.65) ? pick(shots) : null
      const status = pick(TASK_STATES)
      const overdue = chance(0.18)

      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          episodeId: shot?.episodeId ?? null,
          sceneId: shot?.sceneId ?? null,
          shotId: shot?.id ?? null,
          stageId: stages.length > 0 ? pick(stages).id : null,
          title: pick(TASK_TITLES) + (shot ? '' : ' — общая'),
          description: chance(0.4) ? 'Демонстрационная задача с описанием требований и ссылками на референсы.' : null,
          status: status as never,
          priority: pick(PRIORITIES) as never,
          assigneeId: chance(0.85) ? pick(staff).userId : null,
          reviewerId: chance(0.35) ? pick(staff).userId : null,
          estimatedHours: 2 + Math.floor(rnd() * 22),
          actualHours: ['DONE', 'APPROVED'].includes(status) ? 2 + Math.floor(rnd() * 20) : null,
          startDate: daysFromNow(-30 + Math.floor(rnd() * 20)),
          deadline: overdue ? daysFromNow(-Math.floor(rnd() * 20) - 1) : daysFromNow(Math.floor(rnd() * 45)),
          // A slice of the archive so that view is not empty either.
          archivedAt: chance(0.06) ? daysFromNow(-5) : null
        }
      })
      created += 1

      // Dependencies between neighbouring tasks in the same project.
      if (created > 1 && chance(0.25)) {
        const candidate = await prisma.task.findFirst({
          where: { projectId: project.id, id: { not: task.id }, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          skip: 1,
          select: { id: true }
        })
        if (candidate) {
          await prisma.taskDependency.create({
            data: { taskId: task.id, dependsOnTaskId: candidate.id }
          }).catch(() => undefined)
        }
      }
    }
  }
  console.log('  tasks: ' + created)
}

/** Versions, reviews and revisions hanging off real shots (spec 19, 21, 23). */
async function seedCreativeReview(staff: Awaited<ReturnType<typeof seedPeopleAndClients>>['staff']) {
  if (await prisma.version.count() > 20) {
    console.log('  versions: already present, skipped')
    return
  }

  const shots = await prisma.shot.findMany({
    where: { deletedAt: null },
    take: 30,
    select: { id: true, projectId: true, code: true }
  })

  let versions = 0
  let reviews = 0
  let revisions = 0

  for (const shot of shots) {
    const count = 1 + Math.floor(rnd() * 3)
    for (let number = 1; number <= count; number += 1) {
      const isLatest = number === count
      const status = isLatest
        ? pick(['SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'] as const)
        : 'SUPERSEDED'

      const version = await prisma.version.create({
        data: {
          projectId: shot.projectId,
          shotId: shot.id,
          versionNumber: number,
          label: shot.code + '_animation_v' + String(number).padStart(3, '0'),
          notes: chance(0.5) ? 'Правки по замечаниям арт-директора.' : null,
          status: status as never,
          uploadedById: pick(staff).userId,
          fileName: shot.code + '_v' + String(number).padStart(3, '0') + '.mov',
          mimeType: 'video/quicktime',
          fileSize: BigInt(40_000_000 + Math.floor(rnd() * 200_000_000))
        }
      })
      versions += 1

      if (isLatest && status !== 'SUBMITTED') {
        const reviewStatus = status === 'APPROVED' ? 'APPROVED'
          : status === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED'
            : 'IN_REVIEW'
        await prisma.review.create({
          data: {
            versionId: version.id,
            reviewType: pick(['INTERNAL', 'ART_DIRECTOR', 'CLIENT'] as const) as never,
            status: reviewStatus as never,
            reviewerId: pick(staff).userId,
            comment: reviewStatus === 'CHANGES_REQUESTED' ? 'Поправить тайминг и дугу движения.' : null,
            completedAt: reviewStatus === 'IN_REVIEW' ? null : daysFromNow(-2)
          }
        })
        reviews += 1

        if (reviewStatus === 'CHANGES_REQUESTED') {
          await prisma.revision.create({
            data: {
              projectId: shot.projectId,
              shotId: shot.id,
              versionId: version.id,
              round: 1 + Math.floor(rnd() * 2),
              title: 'Правки по ' + shot.code,
              description: 'Замечания клиента по таймингу и цвету.',
              requestedById: pick(staff).userId,
              assignedToId: pick(staff).userId,
              priority: pick(PRIORITIES) as never,
              status: pick(['OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'COMPLETED'] as const) as never,
              deadline: daysFromNow(Math.floor(rnd() * 20))
            }
          })
          revisions += 1
        }
      }
    }
  }
  console.log('  versions: ' + versions + ', reviews: ' + reviews + ', revisions: ' + revisions)
}

export { seedTasks, seedCreativeReview }

const ASSET_TYPES = ['CHARACTER', 'ENVIRONMENT', 'PROP', 'MODEL', 'RIG', 'TEXTURE', 'ANIMATION', 'AUDIO', 'REFERENCE'] as const
const ASSET_NAMES = [
  'Главный герой', 'Караванщик', 'Городская площадь', 'Пустынный оазис', 'Верблюд',
  'Торговая лавка', 'Меч героя', 'Ковёр-самолёт', 'Ночное небо', 'Костёр',
  'Древний свиток', 'Городские ворота', 'Рынок — фон', 'Горный хребет', 'Караван-сарай'
]

const EXPENSE_CATEGORIES = ['EMPLOYEE', 'FREELANCER', 'RENDER', 'SOFTWARE', 'HARDWARE', 'AUDIO', 'PRODUCTION', 'OTHER'] as const
const DOCUMENT_TYPES = ['CONTRACT', 'BRIEF', 'SPECIFICATION', 'INVOICE', 'ACT', 'NDA'] as const

async function seedLibraryAndOps(
  projects: Array<{ id: string, code: string }>,
  staff: Awaited<ReturnType<typeof seedPeopleAndClients>>['staff']
) {
  // ---- assets ----
  if (await prisma.asset.count() === 0) {
    for (const [index, name] of ASSET_NAMES.entries()) {
      await prisma.asset.create({
        data: {
          projectId: pick(projects).id,
          type: ASSET_TYPES[index % ASSET_TYPES.length] as never,
          name,
          description: 'Ассет производственной библиотеки.',
          status: pick(['NOT_STARTED', 'IN_PROGRESS', 'REVIEW', 'APPROVED', 'COMPLETED'] as const) as never,
          ownerId: pick(staff).userId
        }
      })
    }
    console.log('  assets: ' + ASSET_NAMES.length)
  }

  // ---- render farm ----
  if (await prisma.renderNode.count() === 0) {
    await prisma.renderNode.createMany({
      data: [1, 2, 3, 4].map(index => ({
        name: 'render-node-' + String(index).padStart(2, '0'),
        hostname: '10.0.1.' + (20 + index),
        isOnline: index !== 4,
        lastSeenAt: new Date()
      }))
    })
  }
  if (await prisma.renderJob.count() === 0) {
    const nodes = await prisma.renderNode.findMany({ select: { id: true } })
    const shots = await prisma.shot.findMany({ where: { deletedAt: null }, take: 15, select: { id: true, projectId: true } })
    for (const shot of shots) {
      const status = pick(['QUEUED', 'RENDERING', 'COMPLETED', 'FAILED'] as const)
      await prisma.renderJob.create({
        data: {
          projectId: shot.projectId,
          shotId: shot.id,
          nodeId: status === 'QUEUED' ? null : pick(nodes).id,
          startFrame: 1001,
          endFrame: 1001 + 60 + Math.floor(rnd() * 120),
          status: status as never,
          progress: status === 'COMPLETED' ? 100 : status === 'RENDERING' ? Math.floor(rnd() * 90) + 5 : 0,
          priority: pick(PRIORITIES) as never,
          submittedById: pick(staff).userId,
          startedAt: status === 'QUEUED' ? null : daysFromNow(-1),
          completedAt: status === 'COMPLETED' ? daysFromNow(0) : null,
          errorMessage: status === 'FAILED' ? 'Out of memory on frame 1043' : null
        }
      })
    }
    console.log('  render jobs: ' + shots.length)
  }

  // ---- finance ----
  if (await prisma.expense.count() === 0) {
    for (const project of projects) {
      for (let index = 0; index < 6; index += 1) {
        await prisma.expense.create({
          data: {
            projectId: project.id,
            category: pick(EXPENSE_CATEGORIES) as never,
            description: 'Демонстрационный расход по проекту',
            amount: 500 + Math.floor(rnd() * 9000),
            currency: 'USD',
            date: daysFromNow(-Math.floor(rnd() * 90)),
            createdById: pick(staff).userId
          }
        })
      }
    }
    console.log('  expenses: ' + projects.length * 6)
  }

  if (await prisma.invoice.count() === 0) {
    const clients = await prisma.client.findMany({ where: { deletedAt: null }, select: { id: true } })
    for (const [index, project] of projects.entries()) {
      const client = clients[index % clients.length]
      if (!client) continue
      const amount = 15000 + Math.floor(rnd() * 60000)
      const invoice = await prisma.invoice.create({
        data: {
          number: 'INV-2026-' + String(index + 1).padStart(4, '0'),
          clientId: client.id,
          projectId: project.id,
          amount,
          currency: 'USD',
          status: pick(['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] as const) as never,
          dueDate: daysFromNow(-15 + index * 12)
        }
      })
      await prisma.payment.create({
        data: {
          clientId: client.id,
          projectId: project.id,
          invoiceId: invoice.id,
          amount: Math.round(amount * (chance(0.5) ? 1 : 0.5)),
          currency: 'USD',
          status: pick(['PENDING', 'PAID', 'OVERDUE'] as const) as never,
          dueDate: daysFromNow(-10 + index * 12),
          paidDate: chance(0.6) ? daysFromNow(-8 + index * 12) : null,
          method: pick(['bank transfer', 'card', 'cash'] as const)
        }
      })
    }
    console.log('  invoices + payments: ' + projects.length)
  }

  // ---- documents ----
  if (await prisma.document.count() < 5) {
    for (const [index, project] of projects.entries()) {
      await prisma.document.create({
        data: {
          projectId: project.id,
          type: DOCUMENT_TYPES[index % DOCUMENT_TYPES.length] as never,
          name: 'Договор ' + project.code + '.pdf',
          fileUrl: '/uploads/demo/contract-' + project.code + '.pdf',
          mimeType: 'application/pdf',
          fileSize: BigInt(180_000 + Math.floor(rnd() * 900_000)),
          uploadedById: pick(staff).userId
        }
      })
    }
    console.log('  documents: ' + projects.length)
  }

  // ---- timesheets ----
  if (await prisma.timesheetEntry.count() === 0) {
    const employees = await prisma.employee.findMany({ select: { id: true, userId: true } })
    let entries = 0
    for (const employee of employees.slice(0, 12)) {
      for (let day = 1; day <= 6; day += 1) {
        await prisma.timesheetEntry.create({
          data: {
            employeeId: employee.id,
            projectId: pick(projects).id,
            date: daysFromNow(-day * 2),
            hours: 4 + Math.floor(rnd() * 5),
            description: 'Работа по производственным задачам'
          }
        })
        entries += 1
      }
    }
    console.log('  timesheet entries: ' + entries)
  }
}

export { seedLibraryAndOps }

/** Notifications and an activity trail, so those views are not empty either. */
async function seedFeeds(staff: Awaited<ReturnType<typeof seedPeopleAndClients>>['staff']) {
  if (await prisma.notification.count() < 5) {
    const tasks = await prisma.task.findMany({
      where: { deletedAt: null, assigneeId: { not: null } },
      take: 12,
      select: { id: true, title: true, assigneeId: true, project: { select: { code: true } } }
    })
    for (const task of tasks) {
      if (!task.assigneeId) continue
      await prisma.notification.create({
        data: {
          userId: task.assigneeId,
          type: pick(['TASK_ASSIGNED', 'TASK_REVIEW', 'CHANGES_REQUESTED', 'PROJECT_DEADLINE'] as const) as never,
          title: 'Вам назначена задача: ' + task.title,
          body: task.project?.code ?? null,
          linkUrl: '/tasks?task=' + task.id,
          entityType: 'Task',
          entityId: task.id,
          readAt: chance(0.4) ? daysFromNow(0) : null
        }
      })
    }
    console.log('  notifications: ' + tasks.length)
  }

  if (await prisma.activityLog.count() < 20) {
    const projects = await prisma.project.findMany({ where: { deletedAt: null }, select: { id: true } })
    const actions = [
      'project.status_changed', 'stage.status_changed', 'task.created',
      'task.status_changed', 'shot.created', 'version.submitted', 'review.approved'
    ]
    for (let index = 0; index < 40; index += 1) {
      await prisma.activityLog.create({
        data: {
          actorId: pick(staff).userId,
          entityType: 'Project',
          entityId: pick(projects).id,
          projectId: pick(projects).id,
          action: pick(actions),
          metadata: { demo: true }
        }
      })
    }
    console.log('  activity events: 40')
  }
}

async function main() {
  console.log('seeding demo data...')
  const { staff, clients } = await seedPeopleAndClients()
  const projects = await seedProjects(staff, clients)

  // Include the projects that already existed, so tasks spread across all of them.
  const allProjects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, status: true }
  })

  await seedProduction(projects, staff)
  await seedTasks(allProjects, staff)
  await seedCreativeReview(staff)
  await seedLibraryAndOps(allProjects, staff)
  await seedFeeds(staff)

  console.log('demo seed complete.')
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
