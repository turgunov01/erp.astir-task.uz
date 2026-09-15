import type { Prisma } from '@prisma/client'
import { addDays, day, log, prisma, PROJECT_CODE } from './lib'
import { fullName, type ClientInfo, type Staff } from './people'
import type { Production } from './production'
import type { ReviewSeedResult } from './review'
import type { FinanceRefs } from './finance'
import type { TaskRef } from './work'

/**
 * The trail the project left behind: the activity feed replayed in order,
 * the notifications people received, and the audit entries a finance or
 * status change writes.
 */
type Event = Prisma.ActivityLogCreateManyInput

const PROJECT_STATUSES: Array<[string, string, number, string]> = [
  ['DRAFT', 'PLANNING', 0, 'owner'],
  ['PLANNING', 'PRE_PRODUCTION', 3, 'pm'],
  ['PRE_PRODUCTION', 'PRODUCTION', 34, 'pm'],
  ['PRODUCTION', 'POST_PRODUCTION', 98, 'pm'],
  ['POST_PRODUCTION', 'CLIENT_REVIEW', 117, 'pm'],
  ['CLIENT_REVIEW', 'DELIVERY', 123, 'pm'],
  ['DELIVERY', 'COMPLETED', 127, 'owner']
]

export async function seedFeeds(
  staff: Staff,
  client: ClientInfo,
  production: Production,
  tasks: TaskRef[],
  review: ReviewSeedResult,
  finance: FinanceRefs
) {
  const owner = staff.owner!
  const pm = staff.pm!
  const producer = staff.producer!
  const fin = staff.finance!
  const projectId = production.projectId
  const events: Event[] = []
  const push = (event: Event) => { events.push(event) }
  const user = (key: string) => staff[key]?.userId ?? pm.userId

  // ---- the studio and the deal --------------------------------------------
  push({ actorId: producer.userId, entityType: 'Client', entityId: client.id, action: 'client.created', metadata: { name: client.name }, createdAt: day(-9, 11, 30) })
  push({ actorId: pm.userId, entityType: 'Project', entityId: projectId, projectId, action: 'project.created', metadata: { name: '24reply.ai — продуктовые ролики', code: PROJECT_CODE }, createdAt: day(-6, 15, 20) })
  for (const stage of production.stages) {
    push({ actorId: pm.userId, entityType: 'ProjectStage', entityId: stage.id, projectId, action: 'stage.created', metadata: { name: stage.name }, createdAt: day(-5, 10, stage.order) })
  }
  for (const person of Object.values(staff)) {
    if (person.key === 'owner') continue
    push({ actorId: pm.userId, entityType: 'ProjectMember', entityId: person.userId, projectId, action: 'member.added', metadata: { name: fullName(person) }, createdAt: day(person.key === 'pm' || person.key === 'producer' ? -5 : 1, 11, 5) })
  }
  push({ actorId: fin.userId, entityType: 'ProjectBudget', entityId: projectId, projectId, action: 'finance.budget_saved', metadata: { revenue: '120000', plannedCost: '82000' }, createdAt: day(-2, 14) })
  for (const [from, to, onDay, actor] of PROJECT_STATUSES) {
    push({ actorId: user(actor), entityType: 'Project', entityId: projectId, projectId, action: 'project.status_changed', metadata: { from, to }, createdAt: day(onDay, to === 'COMPLETED' ? 18 : 9, 5) })
  }

  // ---- pipeline stages opening and closing ---------------------------------
  for (const stage of production.stages) {
    const actor = user(stage.assigneeKey)
    push({ actorId: actor, entityType: 'ProjectStage', entityId: stage.id, projectId, action: 'stage.status_changed', metadata: { stage: stage.name, from: 'NOT_STARTED', to: 'IN_PROGRESS' }, createdAt: day(stage.from, 9, 30) })
    push({ actorId: actor, entityType: 'ProjectStage', entityId: stage.id, projectId, action: 'stage.status_changed', metadata: { stage: stage.name, from: 'IN_PROGRESS', to: 'DONE' }, createdAt: day(stage.to, 17, 30) })
  }

  // ---- structure ---------------------------------------------------------------
  for (const episode of production.episodes) {
    push({ actorId: pm.userId, entityType: 'Episode', entityId: episode.id, projectId, action: 'episode.created', metadata: { number: episode.number, title: episode.title }, createdAt: day(9, 14, episode.number * 5) })
    push({ actorId: pm.userId, entityType: 'Episode', entityId: episode.id, projectId, action: 'episode.status_changed', metadata: { title: episode.title, from: 'IN_PROGRESS', to: 'COMPLETED' }, createdAt: day(116 + episode.number, 17) })
  }
  for (const scene of production.scenes) {
    push({ actorId: pm.userId, entityType: 'Scene', entityId: scene.id, projectId, action: 'scene.created', metadata: { sceneNumber: (scene.index % 3) + 1, name: scene.name }, createdAt: day(11, 10, scene.index * 3) })
    push({ actorId: user('marat'), entityType: 'Scene', entityId: scene.id, projectId, action: 'scene.status_changed', metadata: { name: scene.name, from: 'IN_PROGRESS', to: 'COMPLETED' }, createdAt: day(112 + Math.floor(scene.index / 3), 16, scene.index) })
  }
  for (const shot of production.shots) {
    push({ actorId: pm.userId, entityType: 'Shot', entityId: shot.id, projectId, action: 'shot.created', metadata: { code: shot.code }, createdAt: day(12, 10, shot.index) })
    push({ actorId: user('marat'), entityType: 'Shot', entityId: shot.id, projectId, action: 'shot.status_changed', metadata: { code: shot.code, from: 'NOT_STARTED', to: 'IN_PROGRESS' }, createdAt: day(52 + Math.floor(shot.index / 3), 10, shot.index) })
    push({ actorId: user('javohir'), entityType: 'Shot', entityId: shot.id, projectId, action: 'shot.status_changed', metadata: { code: shot.code, from: 'REVIEW', to: 'COMPLETED' }, createdAt: day(101 + Math.floor(shot.index / 2), 17, shot.index) })
  }

  // ---- tasks: created, assigned, worked, reviewed, done ---------------------
  for (const task of tasks) {
    const assignee = user(task.assigneeKey)
    const reviewer = user(task.reviewerKey)
    push({ actorId: pm.userId, entityType: 'Task', entityId: task.id, projectId, action: 'task.created', metadata: { title: task.title }, createdAt: addDays(task.start, -3) })
    push({ actorId: pm.userId, entityType: 'Task', entityId: task.id, projectId, action: 'task.assigned', metadata: { title: task.title, assignee: fullName(staff[task.assigneeKey] ?? pm) }, createdAt: new Date(addDays(task.start, -3).getTime() + 5 * 60_000) })
    push({ actorId: assignee, entityType: 'Task', entityId: task.id, projectId, action: 'task.status_changed', metadata: { title: task.title, from: 'READY', to: 'IN_PROGRESS' }, createdAt: task.start })
    push({ actorId: assignee, entityType: 'Task', entityId: task.id, projectId, action: 'task.status_changed', metadata: { title: task.title, from: 'IN_PROGRESS', to: 'REVIEW' }, createdAt: new Date(task.deadline.getTime() - 26 * 3_600_000) })
    push({ actorId: reviewer, entityType: 'Task', entityId: task.id, projectId, action: 'task.status_changed', metadata: { title: task.title, from: 'REVIEW', to: 'DONE' }, createdAt: task.deadline })
  }

  // ---- assets, versions, reviews, revisions, renders, files ---------------
  for (const asset of review.assets) {
    push({ actorId: user(asset.ownerKey), entityType: 'Asset', entityId: asset.id, projectId, action: 'asset.created', metadata: { name: asset.name, type: asset.type }, createdAt: asset.createdAt })
  }
  for (const version of review.versions) {
    push({ actorId: user(version.uploaderKey), entityType: 'Version', entityId: version.id, projectId, action: 'version.created', metadata: { label: version.label, shot: version.shotCode }, createdAt: version.createdAt })
    push({ actorId: user(version.uploaderKey), entityType: 'Version', entityId: version.id, projectId, action: 'version.submitted', metadata: { label: version.label }, createdAt: new Date(version.createdAt.getTime() + 20 * 60_000) })
  }
  for (const item of review.reviews) {
    push({ actorId: item.reviewerId, entityType: 'Review', entityId: item.id, projectId, action: 'review.' + item.decision, metadata: { version: item.versionLabel, shot: item.shotCode }, createdAt: item.completedAt })
  }
  for (const revision of review.revisions) {
    const assignee = user(revision.assigneeKey)
    push({ actorId: revision.requesterId, entityType: 'Revision', entityId: revision.id, projectId, action: 'revision.created', metadata: { title: revision.title, round: revision.round }, createdAt: revision.createdAt })
    push({ actorId: assignee, entityType: 'Revision', entityId: revision.id, projectId, action: 'revision.status_changed', metadata: { title: revision.title, from: 'OPEN', to: 'IN_PROGRESS' }, createdAt: new Date(revision.createdAt.getTime() + 2 * 3_600_000) })
    push({ actorId: assignee, entityType: 'Revision', entityId: revision.id, projectId, action: 'revision.status_changed', metadata: { title: revision.title, from: 'IN_PROGRESS', to: 'COMPLETED' }, createdAt: revision.completedAt })
  }
  for (const job of review.renderJobs) {
    push({ actorId: user('sherzod'), entityType: 'RenderJob', entityId: job.id, projectId, action: 'render.queued', metadata: { shot: job.shotCode }, createdAt: job.createdAt })
  }
  for (const document of finance.documents) {
    push({ actorId: user(document.uploaderKey), entityType: 'Document', entityId: document.id, projectId, action: 'file.uploaded', metadata: { name: document.name }, createdAt: document.createdAt })
  }

  // ---- money ----------------------------------------------------------------------
  for (const expense of finance.expenses) {
    push({ actorId: fin.userId, entityType: 'Expense', entityId: expense.id, projectId, action: 'finance.expense_created', metadata: { amount: String(expense.amount), category: expense.category }, createdAt: expense.date })
  }
  for (const invoice of finance.invoices) {
    push({ actorId: fin.userId, entityType: 'Invoice', entityId: invoice.id, projectId, action: 'finance.invoice_created', metadata: { number: invoice.number, amount: String(invoice.amount) }, createdAt: invoice.issuedAt })
    push({ actorId: fin.userId, entityType: 'Payment', entityId: invoice.id, projectId, action: 'finance.payment_created', metadata: { amount: String(invoice.amount), status: 'PAID' }, createdAt: invoice.paidAt })
  }

  events.sort((a, b) => new Date(a.createdAt as Date).getTime() - new Date(b.createdAt as Date).getTime())
  for (let index = 0; index < events.length; index += 200) {
    await prisma.activityLog.createMany({ data: events.slice(index, index + 200) })
  }

  // ---- notifications -----------------------------------------------------------------
  const notifications: Prisma.NotificationCreateManyInput[] = []
  const finalTask = tasks.find(t => t.title.startsWith('Сдача мастер'))
  const finalRenderTask = tasks.find(t => t.title.startsWith('Финальный рендер'))
  const failedJob = review.renderJobs.find(j => j.status === 'FAILED')
  const clientApprovals = review.reviews.filter(r => r.reviewerId === client.portalUserId && r.decision === 'approved')
  const clientChanges = review.reviews.find(r => r.reviewerId === client.portalUserId && r.decision === 'changes_requested')

  for (const [index, approval] of clientApprovals.entries()) {
    notifications.push({
      userId: owner.userId, type: 'VERSION_APPROVED',
      title: 'Клиент утвердил ' + approval.versionLabel,
      body: '24reply.ai · ' + PROJECT_CODE,
      linkUrl: '/reviews?review=' + approval.id, entityType: 'Review', entityId: approval.id,
      readAt: index === 0 ? approval.completedAt : null, createdAt: approval.completedAt
    })
  }
  if (clientChanges) {
    notifications.push({ userId: owner.userId, type: 'CHANGES_REQUESTED', title: 'Клиент запросил правки по ролику 1', body: 'Цвет CTA и логотип в финале', linkUrl: '/reviews?review=' + clientChanges.id, entityType: 'Review', entityId: clientChanges.id, readAt: clientChanges.completedAt, createdAt: clientChanges.completedAt })
  }
  if (failedJob) {
    notifications.push({ userId: owner.userId, type: 'RENDER_FAILED', title: 'Рендер ' + failedJob.shotCode + ' упал', body: 'Out of memory on frame 1043 — перезапущен на другой ноде', linkUrl: '/render', entityType: 'RenderJob', entityId: failedJob.id, readAt: addDays(failedJob.createdAt, 1), createdAt: failedJob.createdAt })
  }
  if (finalRenderTask) {
    notifications.push({ userId: pm.userId, type: 'TASK_REVIEW', title: 'Задача «' + finalRenderTask.title + '» ждёт проверки', body: PROJECT_CODE, linkUrl: '/tasks?task=' + finalRenderTask.id, entityType: 'Task', entityId: finalRenderTask.id, readAt: finalRenderTask.deadline, createdAt: new Date(finalRenderTask.deadline.getTime() - 26 * 3_600_000) })
  }
  if (finalTask) {
    notifications.push({ userId: owner.userId, type: 'COMMENT_MENTION', title: fullName(pm) + ' упомянула вас в задаче «' + finalTask.title + '»', body: 'Мастера переданы клиенту, акт подписан. Сдали на два дня раньше срока', linkUrl: '/tasks?task=' + finalTask.id, entityType: 'Task', entityId: finalTask.id, readAt: null, createdAt: day(127, 17, 40) })
  }
  notifications.push({ userId: owner.userId, type: 'PROJECT_DEADLINE', title: 'Проект ' + PROJECT_CODE + ' сдан на 2 дня раньше срока', body: '24reply.ai — продуктовые ролики · 120 000 $ · маржа 36 %', linkUrl: '/projects/' + projectId, entityType: 'Project', entityId: projectId, readAt: null, createdAt: day(127, 18, 6) })

  for (const task of tasks) {
    const assignee = staff[task.assigneeKey]
    if (!assignee || assignee.key === 'pm') continue
    notifications.push({ userId: assignee.userId, type: 'TASK_ASSIGNED', title: 'Вам назначена задача: ' + task.title, body: PROJECT_CODE, linkUrl: '/tasks?task=' + task.id, entityType: 'Task', entityId: task.id, readAt: task.start, createdAt: addDays(task.start, -3) })
  }
  for (const revision of review.revisions) {
    const assignee = staff[revision.assigneeKey]
    if (!assignee) continue
    notifications.push({ userId: assignee.userId, type: 'REVISION_CREATED', title: 'Новая правка: ' + revision.title, body: 'Раунд ' + revision.round, linkUrl: '/revisions?revision=' + revision.id, entityType: 'Revision', entityId: revision.id, readAt: revision.completedAt, createdAt: revision.createdAt })
  }
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', deletedAt: null }, select: { id: true } })
  for (const admin of admins) {
    notifications.push({ userId: admin.id, type: 'PROJECT_DEADLINE', title: 'Проект ' + PROJECT_CODE + ' завершён', body: '24reply.ai — продуктовые ролики', linkUrl: '/projects/' + projectId, entityType: 'Project', entityId: projectId, readAt: null, createdAt: day(127, 18, 6) })
  }
  await prisma.notification.createMany({ data: notifications })

  // ---- audit trail ---------------------------------------------------------------
  const audit: Prisma.AuditLogCreateManyInput[] = [
    { actorId: owner.userId, action: 'settings.updated', entityType: 'StudioSettings', ipAddress: '10.0.0.12', metadata: { fields: 'name, legalName, logoUrl' }, createdAt: day(-30, 12) },
    ...finance.invoices.flatMap(invoice => [
      { actorId: fin.userId, action: 'finance.invoice_created', entityType: 'Invoice', entityId: invoice.id, ipAddress: '10.0.0.31', metadata: { number: invoice.number, amount: String(invoice.amount) }, createdAt: invoice.issuedAt },
      { actorId: fin.userId, action: 'finance.payment_created', entityType: 'Payment', entityId: invoice.id, ipAddress: '10.0.0.31', metadata: { number: invoice.number, status: 'PAID' }, createdAt: invoice.paidAt }
    ]),
    { actorId: owner.userId, action: 'project.status_changed', entityType: 'Project', entityId: projectId, ipAddress: '10.0.0.12', metadata: { from: 'DELIVERY', to: 'COMPLETED' }, createdAt: day(127, 18, 5) },
    ...[0, 34, 92, 121, 127].map(onDay => ({ actorId: owner.userId, action: 'auth.login', entityType: 'User', entityId: owner.userId, ipAddress: '10.0.0.12', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140', createdAt: day(onDay, 8, 50) }))
  ]
  await prisma.auditLog.createMany({ data: audit })

  log('activity events: ' + events.length + ', notifications: ' + notifications.length + ', audit entries: ' + audit.length)
}
