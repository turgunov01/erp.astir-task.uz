'use strict'
/** Asset library, money and paperwork, entered by the people who own them. */
import { log } from './api.mjs'
import { next } from './media.mjs'
import * as S from './story.mjs'

export async function assets(ctx, project) {
  const { people } = ctx
  let count = 0
  for (const seed of S.ASSETS) {
    const owner = people.ad.session
    const uploader = people[seed.owner].role === 'ARTIST' ? people[seed.owner].session : people.gulnora.session
    const files = people.owner.session
    const asset = await owner.post('/api/assets', {
      projectId: project.id, type: seed.type, name: seed.name, description: seed.description,
      ownerId: people[seed.owner].userId, status: ['CHARACTER', 'PROP', 'MODEL', 'RIG', 'ENVIRONMENT'].includes(seed.type) ? 'COMPLETED' : 'APPROVED'
    })
    const thumb = await files.upload('/api/files', { assetId: asset.id, type: 'OTHER', name: 'Превью: ' + seed.name }, next('image', 'asset_' + count))
    if (thumb?.fileUrl) await owner.patch('/api/assets/' + asset.id, { thumbnailUrl: thumb.fileUrl })
    if (seed.versioned) {
      for (const number of [1, 2]) {
        const version = await uploader.upload('/api/versions', {
          projectId: project.id, assetId: asset.id, label: seed.name + ' v' + String(number).padStart(3, '0'),
          notes: number === 1 ? 'Первый проход, на ревью арт-директору.' : 'Учтены замечания по пропорциям.'
        }, next('image', 'asset_v' + number + '_' + count))
        await uploader.post('/api/versions/' + version.id + '/submit', { reviewType: 'ART_DIRECTOR', reviewerId: people.ad.userId })
        const pending = await people.ad.session.get('/api/reviews?projectId=' + project.id + '&status=PENDING&limit=100')
        const review = (pending.data ?? []).find(r => r.version?.id === version.id)
        if (review) {
          await people.ad.session.post('/api/reviews/' + review.id + '/decision', number === 1
            ? { decision: 'CHANGES_REQUESTED', comment: 'Пропорции головы к телу сделать 1:1.4, как на утверждённом листе.' }
            : { decision: 'APPROVED', comment: 'Утверждаю, в производство.' })
          if (number === 1) {
            const open = await people.pm.session.get('/api/revisions?projectId=' + project.id + '&status=OPEN&limit=100')
            for (const revision of open.data ?? []) await people.pm.session.patch('/api/revisions/' + revision.id, { status: 'COMPLETED' })
          }
        }
      }
    }
    if (seed.sources) await files.upload('/api/files', { assetId: asset.id, type: 'OTHER', name: 'Исходники: ' + seed.name }, next('zip', 'sources_' + count))
    count += 1
  }
  log('assets ' + count + ' with previews')
}

export async function finances(ctx, project, client) {
  const fin = ctx.people.finance.session
  await fin.post('/api/finance/budgets', { projectId: project.id, revenue: S.MAIN_PROJECT.budget, plannedCost: 82000, currency: 'USD' })
  for (const [category, description, amount, onDay] of S.EXPENSES) {
    await fin.post('/api/finance/expenses', { projectId: project.id, category, description, amount, currency: 'USD', date: S.day(onDay, 12) })
  }
  for (const seed of S.INVOICES) {
    const invoice = await fin.post('/api/finance/invoices', {
      clientId: client.id, projectId: project.id, amount: seed.amount, currency: 'USD', status: 'PENDING',
      issuedAt: S.day(seed.issued, 11), dueDate: S.day(seed.due, 18)
    })
    await fin.post('/api/finance/payments', {
      clientId: client.id, projectId: project.id, invoiceId: invoice.id, amount: seed.amount, currency: 'USD',
      status: 'PAID', dueDate: S.day(seed.due, 18), paidDate: S.day(seed.paid, 14), method: 'bank transfer'
    })
  }
  log('budget, ' + S.EXPENSES.length + ' expenses, ' + S.INVOICES.length + ' invoices paid')
}

export async function documents(ctx, project, client, production, tasks) {
  const { people, departments } = ctx
  let count = 0
  for (const seed of S.DOCUMENTS) {
    const fields = { type: seed.type, name: seed.name }
    const [kind, ref] = (seed.owner ?? '').split(':')
    if (kind === 'client') fields.clientId = client.id
    else if (kind === 'episode') fields.episodeId = production.episodes[Number(ref)]?.id
    else if (kind === 'scene') fields.sceneId = production.scenes[Number(ref)]?.id
    else if (kind === 'shot') fields.shotId = production.shots[Number(ref)]?.id
    else if (kind === 'task') fields.taskId = tasks.find(t => t.title === ref)?.id
    else if (kind === 'department') fields.departmentId = departments.get(ref)
    if (!fields.clientId && !fields.departmentId) fields.projectId = project.id
    const file = next(seed.pool, seed.name.replace(/[^\p{L}\p{N}]+/gu, '_'))
    if (!file) continue
    const uploader = seed.uploader === 'finance' ? people.finance.session : people.owner.session
    await uploader.upload('/api/files', fields, file)
    count += 1
  }
  log('documents ' + count)
}
