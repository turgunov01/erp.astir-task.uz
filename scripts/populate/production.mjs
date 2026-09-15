'use strict'
/**
 * The finished project's production, entered the way the team would enter
 * it: the PM lays out episodes, scenes, shots and tasks; artists move their
 * tasks, upload versions and log hours; the art director reviews; the
 * render TD queues renders.
 */
import { log } from './api.mjs'
import { next } from './media.mjs'
import * as S from './story.mjs'

const REWORK_EVERY = 3

export async function buildProduction(ctx, project) {
  const { people, stages } = ctx
  const pm = people.pm.session
  const episodes = []
  const scenes = []
  const shots = []
  let shotIndex = 0
  let sceneIndex = 0
  for (const seed of S.MAIN_PROJECT.episodes) {
    const episode = await pm.post('/api/episodes', {
      projectId: project.id, number: seed.number, title: seed.title, duration: seed.duration,
      description: 'Ролик ' + seed.number + ' серии для 24reply.ai.',
      startDate: S.day(10 + seed.number * 2), deadline: S.day(116 + seed.number)
    })
    episodes.push(episode)
    for (const [offset, name] of seed.scenes.entries()) {
      const scene = await pm.post('/api/scenes', {
        projectId: project.id, episodeId: episode.id, sceneNumber: offset + 1, name,
        description: 'Сцена ' + (offset + 1) + ' ролика «' + seed.title + '».', duration: Math.round(seed.duration / 3)
      })
      scenes.push({ ...scene, index: sceneIndex, episodeId: episode.id })
      let frame = 1001
      for (let s = 0; s < 3; s += 1) {
        const seconds = 2 + ((shotIndex * 7) % 3)
        const assigneeKey = ['anna', 'anna', 'marat'][shotIndex % 3]
        const shot = await pm.post('/api/shots', {
          projectId: project.id, episodeId: episode.id, sceneId: scene.id, shotNumber: (s + 1) * 10,
          name: S.MAIN_PROJECT.shotNames[s], description: name + ' — ' + S.MAIN_PROJECT.shotNames[s].toLowerCase(),
          duration: seconds, fps: 24, startFrame: frame, endFrame: frame + seconds * 24 - 1,
          assigneeId: people[assigneeKey].userId, deadline: S.day(100 + Math.floor(shotIndex / 2), 18)
        })
        shots.push({ ...shot, index: shotIndex, sceneIndex, assigneeKey, startFrame: frame, endFrame: frame + seconds * 24 - 1 })
        frame += seconds * 24
        shotIndex += 1
      }
      sceneIndex += 1
    }
  }
  log('episodes ' + episodes.length + ', scenes ' + scenes.length + ', shots ' + shots.length)
  return { episodes, scenes, shots, stages }
}

function stageByName(stages, name) {
  const stage = stages.find(s => s.name === name)
  if (!stage) throw new Error('stage missing: ' + name)
  return stage
}

/** Tasks are created by the PM, moved by their assignee, closed by the reviewer. */
export async function createTasks(ctx, project, production) {
  const { people } = ctx
  const pm = people.pm.session
  const tasks = []
  const byTitle = new Map()

  async function enter(input) {
    const stage = stageByName(production.stages, input.stage)
    const dependsOnTaskIds = (input.after ?? []).map(title => byTitle.get(title)).filter(Boolean)
    const task = await pm.post('/api/tasks', {
      projectId: project.id, stageId: stage.id, sceneId: input.sceneId ?? null, episodeId: input.episodeId ?? null,
      title: input.title, description: input.description ?? null, priority: input.priority ?? 'NORMAL',
      assigneeId: people[input.assignee].userId, reviewerId: people[input.reviewer].userId,
      estimatedHours: input.estimate, dependsOnTaskIds
    })
    const ref = { ...task, assignee: input.assignee, reviewer: input.reviewer, actual: input.actual ?? input.estimate, from: input.from, to: input.to }
    tasks.push(ref)
    byTitle.set(input.title, task.id)
    return ref
  }

  for (const seed of S.GENERAL_TASKS) {
    const [from, to] = S.STAGE_WINDOWS[seed.stage]
    await enter({ ...seed, after: seed.after ? [seed.after] : [], from, to })
  }
  for (const scene of production.scenes) {
    let previous = null
    for (const seed of S.PER_SCENE_TASKS) {
      if (seed.only && !seed.only.includes(scene.index)) continue
      const [from, to] = S.STAGE_WINDOWS[seed.stage]
      const span = to - from
      const start = from + Math.floor(span * 0.6 * scene.index / production.scenes.length)
      const shot = production.shots.find(s => s.sceneIndex === scene.index)
      const ref = await enter({
        stage: seed.stage, title: seed.prefix + ': «' + scene.name + '»', assignee: seed.assignee ?? shot.assigneeKey,
        reviewer: seed.stage === 'Animation' ? 'ad' : 'marat', estimate: seed.estimate, actual: seed.estimate + (scene.index % 3) - 1,
        priority: seed.stage === 'Animation' ? 'HIGH' : 'NORMAL', sceneId: scene.id, episodeId: scene.episodeId,
        after: previous ? [previous] : [], from: start, to: start + Math.ceil(span * 0.35)
      })
      previous = ref.title
    }
  }
  log('tasks ' + tasks.length)

  // Work through them in order: the chain of prerequisites is respected by construction.
  for (const task of tasks) {
    const worker = people[task.assignee].session
    const canMove = key => ['OWNER', 'ADMIN', 'PRODUCER', 'PROJECT_MANAGER', 'ARTIST'].includes(people[key].role)
    // The art director has no task:update — the PM moves those on their behalf.
    const mover = canMove(task.assignee) ? worker : pm
    const closer = canMove(task.reviewer) ? people[task.reviewer].session : pm
    await mover.post('/api/tasks/' + task.id + '/status', { status: 'IN_PROGRESS', comment: 'Взял(а) в работу.' })
    await mover.post('/api/tasks/' + task.id + '/status', { status: 'REVIEW', comment: 'Готово, прошу проверить.' })
    await closer.post('/api/tasks/' + task.id + '/status', { status: 'DONE', comment: 'Проверено, принято.' })
    await pm.patch('/api/tasks/' + task.id, { actualHours: task.actual, startDate: S.day(task.from, 9), deadline: S.day(task.to, 18) })
    // Hours logged by the person who did the work, across the days it took.
    let remaining = task.actual
    let offset = task.from
    while (remaining > 0 && offset <= task.to) {
      const weekday = new Date(S.day(offset)).getDay()
      if (weekday !== 0 && weekday !== 6) {
        const hours = Math.min(remaining, 4 + (offset % 4))
        await worker.post('/api/timesheets', { projectId: project.id, taskId: task.id, date: S.dayOnly(offset), hours, description: task.title })
        remaining -= hours
      }
      offset += 1
    }
    const thread = S.TASK_COMMENTS[task.title]
    if (thread) {
      for (const [author, message] of thread) {
        await people[author].session.post('/api/comments', { entityType: 'Task', entityId: task.id, message })
      }
    }
  }
  log('tasks worked, closed, hours and comments logged')
  return tasks
}

async function pendingReviewFor(session, projectId, versionId) {
  const list = await session.get('/api/reviews?projectId=' + projectId + '&status=PENDING&limit=100')
  return (list.data ?? []).find(r => r.version?.id === versionId || r.versionId === versionId)
}

async function decide(ctx, projectId, versionId, reviewerKey, decision, comment) {
  const reviewer = ctx.people[reviewerKey].session
  const review = await pendingReviewFor(reviewer, projectId, versionId)
  if (!review) throw new Error('no pending review for version ' + versionId)
  await reviewer.post('/api/reviews/' + review.id + '/decision', { decision, comment })
  return review
}

async function closeOpenRevisions(ctx, projectId) {
  const worker = ctx.people.pm.session
  const list = await worker.get('/api/revisions?projectId=' + projectId + '&status=OPEN&limit=100')
  for (const revision of list.data ?? []) {
    await worker.patch('/api/revisions/' + revision.id, { status: 'IN_PROGRESS' })
    await worker.patch('/api/revisions/' + revision.id, { status: 'COMPLETED' })
  }
}

/** Versions, reviews and revisions: art-director passes on animation, internal on comp, client on the edits. */
export async function reviewCycle(ctx, project, production, tasks) {
  const { people } = ctx
  let versions = 0
  for (const shot of production.shots) {
    const artist = people[shot.assigneeKey].session
    const rework = shot.index % REWORK_EVERY === 0
    const first = await artist.upload('/api/versions', {
      projectId: project.id, shotId: shot.id, label: shot.code + '_anim_v001', notes: 'Блокинг + сплайны, на ревью АД.'
    }, rework ? next('image', shot.code + '_anim_v001_preview') : next('video', shot.code + '_anim_v001'))
    await artist.post('/api/versions/' + first.id + '/submit', { reviewType: 'ART_DIRECTOR', reviewerId: people.ad.userId })
    versions += 1
    if (rework) {
      await decide(ctx, project.id, first.id, 'ad', 'CHANGES_REQUESTED', S.REWORK_NOTES[shot.index % S.REWORK_NOTES.length])
      await closeOpenRevisions(ctx, project.id)
      const second = await artist.upload('/api/versions', {
        projectId: project.id, shotId: shot.id, label: shot.code + '_anim_v002', notes: 'Правки по дуге движения и таймингу учтены.'
      }, next('video', shot.code + '_anim_v002'))
      await artist.post('/api/versions/' + second.id + '/submit', { reviewType: 'ART_DIRECTOR', reviewerId: people.ad.userId })
      await decide(ctx, project.id, second.id, 'ad', 'APPROVED', 'Теперь чисто. Утверждаю.')
      versions += 1
    } else {
      await decide(ctx, project.id, first.id, 'ad', 'APPROVED', 'Принято, тайминг совпадает с аниматиком.')
    }
    const comp = await people.javohir.session.upload('/api/versions', {
      projectId: project.id, shotId: shot.id, label: shot.code + '_comp_v001', notes: 'Композ с финальным светом, лоуэр-сёрды и CTA.'
    }, next('image', shot.code + '_comp_v001'))
    await people.javohir.session.post('/api/versions/' + comp.id + '/submit', { reviewType: 'INTERNAL', reviewerId: people.marat.userId })
    await decide(ctx, project.id, comp.id, 'marat', 'APPROVED', 'Свет и лоуэр-сёрды на месте.')
    versions += 1
  }

  // The three edits the client saw; the owner records the client's verdict (only a client, owner or admin may close a client review).
  const editTask = tasks.find(t => t.title === 'Монтаж трёх роликов')
  const clientNotes = { 1: 'Кнопка CTA должна быть фирменного зелёного, а не серого. Логотип в финале крупнее.', 3: 'Логотип 24reply в последнем кадре увеличить.' }
  for (const episode of production.episodes) {
    const label = 'EP' + String(episode.number).padStart(2, '0') + '_edit_v001'
    const first = await people.farrux.session.upload('/api/versions', { projectId: project.id, taskId: editTask?.id, label, notes: 'Монтаж ролика ' + episode.number + ' для показа клиенту.' }, next('video', label))
    await people.farrux.session.post('/api/versions/' + first.id + '/submit', { reviewType: 'CLIENT', reviewerId: people.owner.userId })
    versions += 1
    if (clientNotes[episode.number]) {
      await decide(ctx, project.id, first.id, 'owner', 'CHANGES_REQUESTED', clientNotes[episode.number])
      await closeOpenRevisions(ctx, project.id)
      const label2 = label.replace('v001', 'v002')
      const second = await people.farrux.session.upload('/api/versions', { projectId: project.id, taskId: editTask?.id, label: label2, notes: 'Правки клиента внесены.' }, next('video', label2))
      await people.farrux.session.post('/api/versions/' + second.id + '/submit', { reviewType: 'CLIENT', reviewerId: people.owner.userId })
      await decide(ctx, project.id, second.id, 'owner', 'APPROVED', 'Клиент утверждает финал.')
      versions += 1
    } else {
      await decide(ctx, project.id, first.id, 'owner', 'APPROVED', 'Ролик утверждаем без правок. Очень нравится маскот!')
    }
  }
  log('versions ' + versions + ' with reviews and revisions')
}

/** Render jobs queued by the render TD, then reported finished (two failed once). */
export async function renderFarm(ctx, project, production) {
  const td = ctx.people.producer.session
  let jobs = 0
  for (const shot of production.shots) {
    const job = await td.post('/api/render', { projectId: project.id, shotId: shot.id, startFrame: shot.startFrame, endFrame: shot.endFrame, priority: 'NORMAL' })
    if (shot.index === 5 || shot.index === 17) {
      await td.patch('/api/render/' + job.id, { status: 'FAILED', progress: 37, errorMessage: shot.index === 5 ? 'Out of memory on frame 1043' : 'Missing texture: ui_glass_roughness_4k.exr' })
      const retry = await td.post('/api/render', { projectId: project.id, shotId: shot.id, startFrame: shot.startFrame, endFrame: shot.endFrame, priority: 'HIGH' })
      await td.patch('/api/render/' + retry.id, { status: 'COMPLETED', progress: 100 })
      jobs += 1
    } else {
      await td.patch('/api/render/' + job.id, { status: 'COMPLETED', progress: 100 })
    }
    const final = await td.post('/api/render', { projectId: project.id, shotId: shot.id, startFrame: shot.startFrame, endFrame: shot.endFrame, priority: 'URGENT' })
    await td.patch('/api/render/' + final.id, { status: 'COMPLETED', progress: 100 })
    jobs += 2
  }
  log('render jobs ' + jobs)
}

/** Every shot stage and project stage closed, episodes and scenes marked complete. */
export async function closeOut(ctx, project, production) {
  const { people } = ctx
  const pm = people.pm.session
  for (const shot of production.shots) {
    for (const stage of production.stages) {
      const lead = people[S.DEPARTMENT_LEAD[stage.department?.name ?? 'Production'] ?? 'pm'] ?? people.pm
      await lead.session.patch('/api/shots/' + shot.id + '/stages/' + stage.id, { status: 'DONE', progress: 100 })
    }
    await pm.patch('/api/shots/' + shot.id, { status: 'COMPLETED' })
  }
  for (const scene of production.scenes) await pm.patch('/api/scenes/' + scene.id, { status: 'COMPLETED' })
  for (const episode of production.episodes) await pm.patch('/api/episodes/' + episode.id, { status: 'COMPLETED' })
  for (const stage of production.stages) {
    const [from, to] = S.STAGE_WINDOWS[stage.name] ?? [0, 1]
    const lead = people[S.DEPARTMENT_LEAD[stage.department?.name ?? 'Production'] ?? 'pm'] ?? people.pm
    await pm.patch('/api/stages/' + stage.id, { status: 'DONE', progress: 100, assigneeId: lead.userId, deadline: S.day(to, 18) })
  }
  log('shot stages, scenes, episodes and pipeline stages closed')
}
