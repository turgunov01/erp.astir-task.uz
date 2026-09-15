import { attachNext } from './media'
import { addDays, day, log, prisma } from './lib'
import type { ClientInfo, Staff } from './people'
import type { Production, ShotRef } from './production'
import type { TaskRef } from './work'

/**
 * Everything that gets looked at: the asset library, the versions each shot
 * went through, who approved what, the corrections that came back and the
 * render farm that produced the frames.
 */
interface AssetSeed {
  type: 'CHARACTER' | 'ENVIRONMENT' | 'PROP' | 'MODEL' | 'RIG' | 'TEXTURE' | 'ANIMATION' | 'AUDIO' | 'REFERENCE' | 'TEMPLATE'
  name: string
  description: string
  owner: string
  createdDay: number
  /** Two versions with an approval on the second one. */
  versioned?: boolean
  /** A zip of the working files hangs off it. */
  sources?: boolean
}

const ASSETS: readonly AssetSeed[] = [
  { type: 'REFERENCE', name: 'Ключевые визуалы бренда (постеры)', description: 'Постеры и key visuals 24reply.ai из брендбука — палитра, типографика, тон.', owner: 'ad', createdDay: 1 },
  { type: 'CHARACTER', name: 'Маскот «24»', description: 'Круглый зелёный маскот с «24» на груди, глаза-точки, «печатающий» жест.', owner: 'ad', createdDay: 22, versioned: true },
  { type: 'CHARACTER', name: 'ИИ-менеджер', description: 'Стилизованный персонаж-оператор для ролика «Как это работает».', owner: 'ad', createdDay: 24 },
  { type: 'CHARACTER', name: 'Клиент (ночной покупатель)', description: 'Персонаж, который пишет в чат ночью в hero-ролике.', owner: 'ad', createdDay: 25 },
  { type: 'ENVIRONMENT', name: 'Интерфейс чата (3D)', description: 'Объёмный чат с пузырями сообщений и панелью ввода.', owner: 'gulnora', createdDay: 27 },
  { type: 'ENVIRONMENT', name: 'Панель менеджера', description: 'Дашборд с диалогами и кнопкой «передать человеку».', owner: 'gulnora', createdDay: 29 },
  { type: 'ENVIRONMENT', name: 'Офис клиента, ночь', description: 'Тёплый свет настольной лампы, окно с городом.', owner: 'gulnora', createdDay: 31 },
  { type: 'PROP', name: 'Смартфон Hero', description: 'Продуктовый смартфон крупным планом, стекло и алюминий.', owner: 'bekzod', createdDay: 36, versioned: true, sources: true },
  { type: 'PROP', name: 'Пузыри сообщений', description: 'Набор пузырей входящих/исходящих сообщений с анимацией появления.', owner: 'bekzod', createdDay: 38 },
  { type: 'MODEL', name: 'Маскот «24» — high-poly', description: 'Финальная геометрия под риг и рендер.', owner: 'bekzod', createdDay: 40, versioned: true },
  { type: 'TEXTURE', name: 'Материалы UI: glass / matte', description: 'Стеклянные и матовые материалы интерфейса, PBR.', owner: 'zilola', createdDay: 44 },
  { type: 'RIG', name: 'Риг маскота', description: 'Body-риг с лицевыми контролами и жестом «печатает».', owner: 'sardor', createdDay: 48, versioned: true },
  { type: 'ANIMATION', name: 'Цикл «печатает…»', description: 'Зацикленная анимация ожидания ответа.', owner: 'anna', createdDay: 62 },
  { type: 'AUDIO', name: 'Джингл 24reply', description: 'Фирменный трёхнотный джингл, 2.4 с.', owner: 'dilshod', createdDay: 92 },
  { type: 'TEMPLATE', name: 'Шаблон лоуэр-сёрда', description: 'Подписи и CTA в фирменном стиле для всех трёх роликов.', owner: 'javohir', createdDay: 100 }
]

export interface VersionRef {
  id: string
  label: string
  shotCode: string | null
  uploaderKey: string
  createdAt: Date
  submitted: boolean
}
export interface ReviewRef {
  id: string
  versionLabel: string
  shotCode: string | null
  decision: 'approved' | 'changes_requested'
  reviewerId: string
  completedAt: Date
}
export interface RevisionRef {
  id: string
  title: string
  round: number
  requesterId: string
  assigneeKey: string
  createdAt: Date
  completedAt: Date
}
export interface RenderRef {
  id: string
  shotCode: string
  status: string
  createdAt: Date
}

export interface ReviewSeedResult {
  versions: VersionRef[]
  reviews: ReviewRef[]
  revisions: RevisionRef[]
  renderJobs: RenderRef[]
  assets: Array<{ id: string, name: string, type: string, createdAt: Date, ownerKey: string }>
}

const CHANGES = [
  'Дуга движения руки маскота рваная на кадрах 1012–1020, и пауза перед ответом на 4 кадра длиннее аниматика.',
  'Пузырь сообщения появляется раньше, чем маскот заканчивает жест. Сдвинуть на 6 кадров.',
  'Слишком резкий «блик» на смартфоне в конце шота — притушить, отвлекает от текста.'
]

function slug(name: string) {
  return name.replace(/[^\p{L}\p{N}]+/gu, '_')
}

export async function seedReview(
  staff: Staff,
  client: ClientInfo,
  production: Production,
  tasks: TaskRef[]
): Promise<ReviewSeedResult> {
  const ad = staff.ad!
  const prefix = 'projects/' + production.projectId
  const result: ReviewSeedResult = { versions: [], reviews: [], revisions: [], renderJobs: [], assets: [] }

  // ---- asset library -------------------------------------------------
  for (const seed of ASSETS) {
    const thumbnail = await attachNext('image', prefix, 'asset_' + slug(seed.name))
    const asset = await prisma.asset.create({
      data: {
        projectId: production.projectId,
        type: seed.type,
        name: seed.name,
        description: seed.description,
        thumbnailUrl: thumbnail?.url ?? null,
        status: ['CHARACTER', 'PROP', 'MODEL', 'RIG', 'ENVIRONMENT'].includes(seed.type) ? 'COMPLETED' : 'APPROVED',
        ownerId: staff[seed.owner]?.userId ?? null,
        createdAt: day(seed.createdDay, 11)
      }
    })
    result.assets.push({ id: asset.id, name: seed.name, type: seed.type, createdAt: day(seed.createdDay, 11), ownerKey: seed.owner })

    if (seed.versioned) {
      for (const number of [1, 2]) {
        const image = await attachNext('image', prefix, slug(seed.name) + '_v00' + number)
        const createdAt = day(seed.createdDay + number * 4, 15)
        const version = await prisma.version.create({
          data: {
            projectId: production.projectId,
            assetId: asset.id,
            versionNumber: number,
            label: seed.name + ' v' + String(number).padStart(3, '0'),
            fileUrl: image?.url ?? null,
            previewUrl: image?.url ?? null,
            fileName: image?.name ?? null,
            fileSize: image ? BigInt(image.size) : null,
            mimeType: image?.mimeType ?? null,
            notes: number === 1 ? 'Первый проход, на ревью арт-директору.' : 'Учтены замечания по пропорциям.',
            status: number === 1 ? 'SUPERSEDED' : 'APPROVED',
            uploadedById: staff[seed.owner]?.userId ?? null,
            createdAt
          }
        })
        result.versions.push({ id: version.id, label: version.label, shotCode: null, uploaderKey: seed.owner, createdAt, submitted: true })
        const review = await prisma.review.create({
          data: {
            versionId: version.id,
            reviewType: 'ART_DIRECTOR',
            status: number === 1 ? 'CHANGES_REQUESTED' : 'APPROVED',
            reviewerId: ad.userId,
            comment: number === 1 ? 'Пропорции головы к телу сделать 1:1.4, как на утверждённом листе.' : 'Утверждаю, в производство.',
            createdAt,
            completedAt: addDays(createdAt, 1)
          }
        })
        result.reviews.push({
          id: review.id, versionLabel: version.label, shotCode: null,
          decision: number === 1 ? 'changes_requested' : 'approved', reviewerId: ad.userId, completedAt: addDays(createdAt, 1)
        })
      }
    }

    if (seed.sources) {
      const zip = await attachNext('zip', prefix, 'sources_' + slug(seed.name))
      if (zip) {
        await prisma.document.create({
          data: {
            projectId: production.projectId,
            assetId: asset.id,
            type: 'OTHER',
            name: 'Исходники: ' + seed.name + '.zip',
            fileUrl: zip.url,
            fileSize: BigInt(zip.size),
            mimeType: zip.mimeType,
            uploadedById: staff[seed.owner]?.userId ?? null,
            createdAt: day(seed.createdDay + 9, 17)
          }
        })
      }
    }
  }

  // ---- shot versions: animation, then compositing --------------------
  const animation = production.stage('Animation')
  const compositing = production.stage('Compositing')
  const total = production.shots.length

  async function shotVersion(shot: ShotRef, kind: 'anim' | 'comp', number: number, when: Date, status: string, uploaderKey: string, withVideo: boolean) {
    const base = shot.code + '_' + kind + '_v' + String(number).padStart(3, '0')
    const video = withVideo ? await attachNext('video', prefix, base) : null
    const preview = await attachNext('image', prefix, base + '_preview')
    const version = await prisma.version.create({
      data: {
        projectId: production.projectId,
        shotId: shot.id,
        versionNumber: number,
        label: base,
        fileUrl: video?.url ?? null,
        previewUrl: preview?.url ?? null,
        fileName: video?.name ?? base + '.mp4',
        fileSize: video ? BigInt(video.size) : BigInt(18_000_000 + shot.index * 250_000),
        mimeType: video?.mimeType ?? 'video/mp4',
        notes: kind === 'anim'
          ? (number === 1 ? 'Блокинг + сплайны, на ревью АД.' : 'Правки по дуге движения и таймингу учтены.')
          : 'Композ с финальным светом, лоуэр-сёрды и CTA.',
        status: status as never,
        uploadedById: staff[uploaderKey]?.userId ?? null,
        createdAt: when
      }
    })
    result.versions.push({ id: version.id, label: base, shotCode: shot.code, uploaderKey, createdAt: when, submitted: true })
    return version
  }

  for (const shot of production.shots) {
    const lag = Math.floor((animation.to - animation.from) * 0.6 * shot.index / total)
    const firstAt = day(animation.from + lag + 4, 16, shot.index)
    const needsRework = shot.index % 3 === 0

    const first = await shotVersion(shot, 'anim', 1, firstAt, needsRework ? 'SUPERSEDED' : 'APPROVED', shot.assigneeKey, !needsRework)
    const firstReview = await prisma.review.create({
      data: {
        versionId: first.id,
        reviewType: 'ART_DIRECTOR',
        status: needsRework ? 'CHANGES_REQUESTED' : 'APPROVED',
        reviewerId: ad.userId,
        comment: needsRework ? CHANGES[shot.index % CHANGES.length] : 'Принято, тайминг совпадает с аниматиком.',
        deadline: addDays(firstAt, 2),
        createdAt: firstAt,
        completedAt: addDays(firstAt, 1)
      }
    })
    result.reviews.push({
      id: firstReview.id, versionLabel: first.label, shotCode: shot.code,
      decision: needsRework ? 'changes_requested' : 'approved', reviewerId: ad.userId, completedAt: addDays(firstAt, 1)
    })

    if (needsRework) {
      const revisionAt = addDays(firstAt, 1)
      const revisionDone = addDays(firstAt, 3)
      const revision = await prisma.revision.create({
        data: {
          projectId: production.projectId,
          shotId: shot.id,
          versionId: first.id,
          round: 1,
          title: 'Правки анимации ' + shot.code,
          description: CHANGES[shot.index % CHANGES.length],
          requestedById: ad.userId,
          assignedToId: staff[shot.assigneeKey]?.userId ?? null,
          priority: 'HIGH',
          status: 'COMPLETED',
          deadline: addDays(firstAt, 3),
          createdAt: revisionAt,
          completedAt: revisionDone
        }
      })
      result.revisions.push({ id: revision.id, title: revision.title, round: 1, requesterId: ad.userId, assigneeKey: shot.assigneeKey, createdAt: revisionAt, completedAt: revisionDone })
      await prisma.comment.create({
        data: { userId: staff[shot.assigneeKey]?.userId ?? ad.userId, entityType: 'Review', entityId: firstReview.id, message: 'Поняла, поправлю дугу и сдвину пузырь. Вторая версия будет послезавтра.', createdAt: addDays(firstAt, 1) }
      })

      const secondAt = addDays(firstAt, 3)
      const second = await shotVersion(shot, 'anim', 2, secondAt, 'APPROVED', shot.assigneeKey, true)
      const secondReview = await prisma.review.create({
        data: {
          versionId: second.id,
          reviewType: 'ART_DIRECTOR',
          status: 'APPROVED',
          reviewerId: ad.userId,
          comment: 'Теперь чисто. Утверждаю.',
          createdAt: secondAt,
          completedAt: addDays(secondAt, 1)
        }
      })
      result.reviews.push({ id: secondReview.id, versionLabel: second.label, shotCode: shot.code, decision: 'approved', reviewerId: ad.userId, completedAt: addDays(secondAt, 1) })
    }

    // Compositing pass: internal approval by the layout lead.
    const compLag = Math.floor((compositing.to - compositing.from) * 0.6 * shot.index / total)
    const compAt = day(compositing.from + compLag + 3, 17, shot.index)
    const comp = await shotVersion(shot, 'comp', 1, compAt, 'APPROVED', 'javohir', false)
    const compReview = await prisma.review.create({
      data: {
        versionId: comp.id,
        reviewType: 'INTERNAL',
        status: 'APPROVED',
        reviewerId: staff.marat?.userId ?? ad.userId,
        comment: 'Свет и лоуэр-сёрды на месте.',
        createdAt: compAt,
        completedAt: addDays(compAt, 1)
      }
    })
    result.reviews.push({ id: compReview.id, versionLabel: comp.label, shotCode: shot.code, decision: 'approved', reviewerId: staff.marat?.userId ?? ad.userId, completedAt: addDays(compAt, 1) })
  }

  // ---- the edits the client saw ---------------------------------------
  const editTask = tasks.find(t => t.title === 'Монтаж трёх роликов')
  const clientReviewDay = production.stage('Client Review').from
  const CLIENT_NOTES: Record<number, string> = {
    1: 'Кнопка CTA должна быть фирменного зелёного, а не серого. Логотип в финале крупнее.',
    3: 'В сравнении «бот vs ИИ» логотип 24reply мелковат — увеличить в последнем кадре.'
  }
  for (const episode of production.episodes) {
    const changes = CLIENT_NOTES[episode.number]
    const firstAt = day(clientReviewDay, 11, episode.number * 10)
    const firstLabel = 'EP' + String(episode.number).padStart(2, '0') + '_edit_v001'
    const firstVideo = await attachNext('video', prefix, firstLabel)
    const firstPreview = await attachNext('image', prefix, firstLabel + '_preview')
    const first = await prisma.version.create({
      data: {
        projectId: production.projectId,
        taskId: editTask?.id ?? null,
        versionNumber: 1,
        label: firstLabel,
        fileUrl: firstVideo?.url ?? null,
        previewUrl: firstPreview?.url ?? null,
        fileName: firstVideo?.name ?? firstLabel + '.mp4',
        fileSize: firstVideo ? BigInt(firstVideo.size) : null,
        mimeType: firstVideo?.mimeType ?? 'video/mp4',
        notes: 'Монтаж ролика ' + episode.number + ' для показа клиенту.',
        status: changes ? 'SUPERSEDED' : 'APPROVED',
        uploadedById: staff.farrux?.userId ?? null,
        createdAt: firstAt
      }
    })
    result.versions.push({ id: first.id, label: firstLabel, shotCode: null, uploaderKey: 'farrux', createdAt: firstAt, submitted: true })
    const clientReview = await prisma.review.create({
      data: {
        versionId: first.id,
        reviewType: 'CLIENT',
        status: changes ? 'CHANGES_REQUESTED' : 'APPROVED',
        reviewerId: client.portalUserId,
        comment: changes ?? 'Ролик утверждаем без правок. Очень нравится маскот!',
        deadline: day(clientReviewDay + 3, 18),
        createdAt: firstAt,
        completedAt: day(clientReviewDay + 1, 12, episode.number * 10)
      }
    })
    result.reviews.push({ id: clientReview.id, versionLabel: firstLabel, shotCode: null, decision: changes ? 'changes_requested' : 'approved', reviewerId: client.portalUserId, completedAt: day(clientReviewDay + 1, 12, episode.number * 10) })

    if (changes) {
      const revision = await prisma.revision.create({
        data: {
          projectId: production.projectId,
          taskId: tasks.find(t => t.title.startsWith('Правки клиента'))?.id ?? null,
          versionId: first.id,
          round: 2,
          title: 'Правки клиента по ролику ' + episode.number,
          description: changes,
          requestedById: client.portalUserId,
          assignedToId: staff.javohir?.userId ?? null,
          priority: 'URGENT',
          status: 'COMPLETED',
          deadline: day(clientReviewDay + 4, 18),
          createdAt: day(clientReviewDay + 1, 13),
          completedAt: day(clientReviewDay + 3, 15)
        }
      })
      result.revisions.push({ id: revision.id, title: revision.title, round: 2, requesterId: client.portalUserId, assigneeKey: 'javohir', createdAt: day(clientReviewDay + 1, 13), completedAt: day(clientReviewDay + 3, 15) })
      await prisma.comment.create({
        data: { userId: staff.pm?.userId ?? ad.userId, entityType: 'Review', entityId: clientReview.id, message: 'Приняли, обе правки внесём до конца недели и пришлём v002.', createdAt: day(clientReviewDay + 1, 13, 30) }
      })

      const secondAt = day(clientReviewDay + 4, 10, episode.number * 10)
      const secondLabel = 'EP' + String(episode.number).padStart(2, '0') + '_edit_v002'
      const secondVideo = await attachNext('video', prefix, secondLabel)
      const secondPreview = await attachNext('image', prefix, secondLabel + '_preview')
      const second = await prisma.version.create({
        data: {
          projectId: production.projectId,
          taskId: editTask?.id ?? null,
          versionNumber: 2,
          label: secondLabel,
          fileUrl: secondVideo?.url ?? null,
          previewUrl: secondPreview?.url ?? null,
          fileName: secondVideo?.name ?? secondLabel + '.mp4',
          fileSize: secondVideo ? BigInt(secondVideo.size) : null,
          mimeType: secondVideo?.mimeType ?? 'video/mp4',
          notes: 'Правки клиента внесены: цвет CTA, логотип в финале.',
          status: 'APPROVED',
          uploadedById: staff.farrux?.userId ?? null,
          createdAt: secondAt
        }
      })
      result.versions.push({ id: second.id, label: secondLabel, shotCode: null, uploaderKey: 'farrux', createdAt: secondAt, submitted: true })
      const finalReview = await prisma.review.create({
        data: {
          versionId: second.id,
          reviewType: 'CLIENT',
          status: 'APPROVED',
          reviewerId: client.portalUserId,
          comment: 'Всё отлично, утверждаем финал.',
          createdAt: secondAt,
          completedAt: secondAt
        }
      })
      result.reviews.push({ id: finalReview.id, versionLabel: secondLabel, shotCode: null, decision: 'approved', reviewerId: client.portalUserId, completedAt: secondAt })
    }
  }

  // ---- render farm -----------------------------------------------------
  const nodes = []
  for (const index of [1, 2, 3, 4]) {
    nodes.push(await prisma.renderNode.upsert({
      where: { name: 'render-' + String(index).padStart(2, '0') },
      update: { isOnline: index !== 4, lastSeenAt: index === 4 ? day(110, 3) : new Date() },
      create: {
        name: 'render-' + String(index).padStart(2, '0'),
        hostname: '10.0.1.' + (20 + index),
        isOnline: index !== 4,
        lastSeenAt: index === 4 ? day(110, 3) : new Date(),
        createdAt: day(-200)
      }
    }))
  }
  const rendering = production.stage('Rendering')
  const finalRender = production.stage('Final Render')
  const FAILURES: Record<number, string> = {
    5: 'Out of memory on frame 1043 (node render-02)',
    17: 'Missing texture: ui_glass_roughness_4k.exr'
  }
  for (const shot of production.shots) {
    const lag = Math.floor((rendering.to - rendering.from) * 0.6 * shot.index / total)
    const queuedAt = day(rendering.from + lag, 20, shot.index)
    const failure = FAILURES[shot.index]
    if (failure) {
      const failed = await prisma.renderJob.create({
        data: {
          projectId: production.projectId, shotId: shot.id, nodeId: nodes[1]?.id ?? null,
          startFrame: shot.startFrame, endFrame: shot.endFrame, status: 'FAILED', progress: 37, priority: 'NORMAL',
          submittedById: staff.sherzod?.userId ?? null, startedAt: queuedAt, completedAt: null,
          errorMessage: failure, createdAt: queuedAt
        }
      })
      result.renderJobs.push({ id: failed.id, shotCode: shot.code, status: 'FAILED', createdAt: queuedAt })
    }
    const job = await prisma.renderJob.create({
      data: {
        projectId: production.projectId, shotId: shot.id, nodeId: nodes[shot.index % 3]?.id ?? null,
        startFrame: shot.startFrame, endFrame: shot.endFrame, status: 'COMPLETED', progress: 100,
        priority: failure ? 'HIGH' : 'NORMAL', submittedById: staff.sherzod?.userId ?? null,
        startedAt: addDays(queuedAt, failure ? 1 : 0), completedAt: addDays(queuedAt, failure ? 2 : 1),
        createdAt: addDays(queuedAt, failure ? 1 : 0)
      }
    })
    result.renderJobs.push({ id: job.id, shotCode: shot.code, status: 'COMPLETED', createdAt: addDays(queuedAt, failure ? 1 : 0) })

    const finalAt = day(finalRender.from + (shot.index % 3), 21, shot.index)
    const final = await prisma.renderJob.create({
      data: {
        projectId: production.projectId, shotId: shot.id, nodeId: nodes[shot.index % 3]?.id ?? null,
        startFrame: shot.startFrame, endFrame: shot.endFrame, status: 'COMPLETED', progress: 100, priority: 'URGENT',
        submittedById: staff.sherzod?.userId ?? null, startedAt: finalAt, completedAt: addDays(finalAt, 1), createdAt: finalAt
      }
    })
    result.renderJobs.push({ id: final.id, shotCode: shot.code, status: 'COMPLETED', createdAt: finalAt })
  }
  const cancelledShot = production.shots[8]
  if (cancelledShot) {
    const cancelledAt = day(rendering.from + 6, 9)
    const cancelled = await prisma.renderJob.create({
      data: {
        projectId: production.projectId, shotId: cancelledShot.id, nodeId: null,
        startFrame: cancelledShot.startFrame, endFrame: cancelledShot.endFrame, status: 'CANCELLED', progress: 0,
        priority: 'LOW', submittedById: staff.nigora?.userId ?? null, createdAt: cancelledAt,
        errorMessage: 'Отменён: свет ещё не утверждён, перезапущен позже.'
      }
    })
    result.renderJobs.push({ id: cancelled.id, shotCode: cancelledShot.code, status: 'CANCELLED', createdAt: cancelledAt })
  }

  log('assets: ' + result.assets.length + ', versions: ' + result.versions.length + ', reviews: ' + result.reviews.length +
    ', revisions: ' + result.revisions.length + ', render jobs: ' + result.renderJobs.length)
  return result
}
