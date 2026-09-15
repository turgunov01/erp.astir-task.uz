'use strict'
/** A job in flight: some stages done, tasks across the board, a review waiting, a revision open, a render running. */
import { log } from './api.mjs'
import { next } from './media.mjs'
import * as S from './story.mjs'

export async function sideProject(ctx, clientsByKey, seed, projectExists) {
  const { people } = ctx
  const pm = people.pm.session
  if (await projectExists(pm, seed.code)) { log(seed.code + ' already exists, skipped'); return }
  const client = clientsByKey[seed.client]
  const project = await people.producer.session.post('/api/projects', {
    code: seed.code, name: seed.name, description: seed.description, clientId: client.id,
    projectManagerId: people.pm.userId, producerId: people.producer.userId, projectType: seed.projectType,
    status: 'DRAFT', priority: seed.priority, startDate: S.day(seed.startDay), deadline: S.day(seed.deadlineDay),
    budget: seed.budget, currency: 'USD', template: seed.template
  })
  for (const key of ['producer', 'ad', 'gulnora', 'anna', 'marat', 'javohir', 'dilshod', 'farrux', 'finance']) {
    await pm.post('/api/projects/' + project.id + '/members', { userId: people[key].userId, roleLabel: people[key].position })
  }
  const stages = (await pm.get('/api/stages?projectId=' + project.id)).data ?? []
  for (const [index, stage] of stages.entries()) {
    if (index < seed.doneStages) await pm.patch('/api/stages/' + stage.id, { status: 'DONE', progress: 100 })
    else if (stage.name === seed.currentStage) await pm.patch('/api/stages/' + stage.id, { status: 'IN_PROGRESS', progress: 45 })
  }
  await pm.patch('/api/projects/' + project.id, { status: seed.status })

  const shots = []
  if (seed.shots > 0) {
    const episode = await pm.post('/api/episodes', { projectId: project.id, number: 1, title: 'Ролик 45″', duration: 45 })
    let scene = null
    for (let s = 0; s < seed.shots; s += 1) {
      if (s % 3 === 0) {
        scene = await pm.post('/api/scenes', {
          projectId: project.id, episodeId: episode.id, sceneNumber: Math.floor(s / 3) + 1,
          name: ['Приложение в руках', 'У банкомата'][Math.floor(s / 3)] ?? 'Сцена'
        })
      }
      const shot = await pm.post('/api/shots', {
        projectId: project.id, episodeId: episode.id, sceneId: scene.id, shotNumber: (s % 3 + 1) * 10,
        name: ['Общий план', 'Средний план', 'Крупный план'][s % 3], fps: 24, startFrame: 1001, endFrame: 1073, duration: 3,
        assigneeId: people[s % 2 ? 'marat' : 'anna'].userId, deadline: S.day(seed.startDay + 45 + s * 2, 18)
      })
      shots.push(shot)
      if (s < 3) await pm.patch('/api/shots/' + shot.id, { status: 'IN_PROGRESS' })
      for (const [index, stage] of stages.entries()) {
        if (index < seed.doneStages) await pm.patch('/api/shots/' + shot.id + '/stages/' + stage.id, { status: 'DONE', progress: 100 })
        else if (stage.name === seed.currentStage && s < 3) await pm.patch('/api/shots/' + shot.id + '/stages/' + stage.id, { status: 'IN_PROGRESS', progress: 30 + s * 20 })
      }
    }
  }

  for (const task of seed.tasks) {
    const stage = stages.find(s => s.name === task.stage)
    const worker = ['OWNER', 'ADMIN', 'PRODUCER', 'PROJECT_MANAGER', 'ARTIST'].includes(people[task.assignee].role) ? people[task.assignee].session : pm
    const created = await pm.post('/api/tasks', {
      projectId: project.id, stageId: stage?.id ?? null, title: task.title, priority: task.priority ?? 'NORMAL',
      assigneeId: people[task.assignee].userId, reviewerId: people.ad.userId, estimatedHours: task.estimate,
      startDate: S.day(seed.startDay + 2), deadline: S.day(seed.deadlineDay - 10, 18)
    })
    if (task.status === 'READY') await pm.post('/api/tasks/' + created.id + '/status', { status: 'READY', comment: 'Можно брать.' })
    if (['IN_PROGRESS', 'REVIEW', 'DONE'].includes(task.status)) await worker.post('/api/tasks/' + created.id + '/status', { status: 'IN_PROGRESS', comment: 'Взял(а) в работу.' })
    if (['REVIEW', 'DONE'].includes(task.status)) await worker.post('/api/tasks/' + created.id + '/status', { status: 'REVIEW', comment: 'Готово, прошу проверить.' })
    if (task.status === 'DONE') await pm.post('/api/tasks/' + created.id + '/status', { status: 'DONE', comment: 'Принято.' })
    if (task.overdue) await pm.patch('/api/tasks/' + created.id, { deadline: S.day(132, 18), overdueReason: 'Диктор заболел, запись перенесена на неделю' })
    if (task.status !== 'BACKLOG') await worker.post('/api/timesheets', { projectId: project.id, taskId: created.id, date: S.dayOnly(133), hours: 5, description: task.title })
  }

  if (shots.length) {
    const waiting = await people.anna.session.upload('/api/versions', { projectId: project.id, shotId: shots[0].id, label: shots[0].code + '_anim_v001', notes: 'Первый проход анимации.' }, next('video', seed.code + '_anim'))
    await people.anna.session.post('/api/versions/' + waiting.id + '/submit', { reviewType: 'ART_DIRECTOR', reviewerId: people.ad.userId })
    const reworked = await people.marat.session.upload('/api/versions', { projectId: project.id, shotId: shots[1].id, label: shots[1].code + '_anim_v001', notes: 'Блокинг персонажей.' }, next('image', seed.code + '_preview'))
    await people.marat.session.post('/api/versions/' + reworked.id + '/submit', { reviewType: 'ART_DIRECTOR', reviewerId: people.ad.userId })
    const pending = await people.ad.session.get('/api/reviews?projectId=' + project.id + '&status=PENDING&limit=50')
    const review = (pending.data ?? []).find(r => r.version?.id === reworked.id)
    if (review) await people.ad.session.post('/api/reviews/' + review.id + '/decision', { decision: 'CHANGES_REQUESTED', comment: 'Персонаж у банкомата «плывёт» на кадрах 1030–1040, нужен контакт ног с полом.' })
    const job = await people.producer.session.post('/api/render', { projectId: project.id, shotId: shots[2].id, startFrame: 1001, endFrame: 1073, priority: 'HIGH' })
    await people.producer.session.patch('/api/render/' + job.id, { status: 'RENDERING', progress: 42 })
  }
  await people.finance.session.post('/api/finance/budgets', { projectId: project.id, revenue: seed.budget, plannedCost: Math.round(seed.budget * 0.7), currency: 'USD' })
  await people.finance.session.post('/api/finance/invoices', { clientId: client.id, projectId: project.id, amount: Math.round(seed.budget * 0.4), currency: 'USD', status: 'PENDING', issuedAt: S.day(seed.startDay + 1, 11), dueDate: S.day(seed.startDay + 15, 18) })
  log(seed.code + ' in flight (' + seed.status + ')')
}
