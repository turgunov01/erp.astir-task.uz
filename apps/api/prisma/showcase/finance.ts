import { attachNext, type Pool } from './media'
import { day, log, prisma } from './lib'
import type { ClientInfo, Staff } from './people'
import type { Production } from './production'
import type { ReviewSeedResult } from './review'
import type { TaskRef } from './work'

/**
 * Money and paperwork: the budget the project was sold on, what it actually
 * cost, the three invoices the client paid and every document that was
 * exchanged along the way, attached where it belongs.
 */
interface ExpenseSeed {
  category: 'EMPLOYEE' | 'FREELANCER' | 'RENDER' | 'SOFTWARE' | 'HARDWARE' | 'AUDIO' | 'PRODUCTION' | 'OTHER'
  description: string
  amount: number
  onDay: number
}

const EXPENSES: readonly ExpenseSeed[] = [
  { category: 'SOFTWARE', description: 'Лицензии Maya + Houdini на команду, 4 месяца', amount: 3200, onDay: 2 },
  { category: 'PRODUCTION', description: 'Съёмка референсов интерфейса и офиса клиента', amount: 640, onDay: 8 },
  { category: 'OTHER', description: 'Печать раскадровки и курьер клиенту', amount: 90, onDay: 21 },
  { category: 'EMPLOYEE', description: 'Зарплата команды за май', amount: 11800, onDay: 27 },
  { category: 'SOFTWARE', description: 'Substance 3D + Nuke, доп. места', amount: 1150, onDay: 29 },
  { category: 'HARDWARE', description: 'SSD 4 ТБ под рендер-кэш', amount: 420, onDay: 60 },
  { category: 'EMPLOYEE', description: 'Зарплата команды за июнь', amount: 14200, onDay: 57 },
  { category: 'FREELANCER', description: 'Композитор — джингл и музыкальная подложка', amount: 2500, onDay: 77 },
  { category: 'AUDIO', description: 'Лицензия на звуковую библиотеку UI-звуков', amount: 380, onDay: 79 },
  { category: 'EMPLOYEE', description: 'Зарплата команды за июль', amount: 15600, onDay: 88 },
  { category: 'FREELANCER', description: 'Диктор — озвучка UZ / RU / EN', amount: 900, onDay: 106 },
  { category: 'RENDER', description: 'Облачный рендер — основной проход', amount: 3400, onDay: 108 },
  { category: 'EMPLOYEE', description: 'Зарплата команды за август', amount: 15100, onDay: 119 },
  { category: 'RENDER', description: 'Облачный рендер — финальный 4K', amount: 1650, onDay: 126 },
  { category: 'EMPLOYEE', description: 'Зарплата команды за сентябрь (до сдачи)', amount: 4900, onDay: 127 }
]

const INVOICES = [
  { number: 'INV-0001', title: 'Аванс 40 %', amount: 48000, issued: 1, due: 15, paid: 10 },
  { number: 'INV-0002', title: 'Этап «Анимация завершена», 30 %', amount: 36000, issued: 92, due: 106, paid: 103 },
  { number: 'INV-0003', title: 'Финальный платёж 30 %', amount: 36000, issued: 127, due: 141, paid: 131 }
]

export interface FinanceRefs {
  invoices: Array<{ id: string, number: string, amount: number, issuedAt: Date, paidAt: Date }>
  expenses: Array<{ id: string, amount: number, category: string, date: Date }>
  documents: Array<{ id: string, name: string, createdAt: Date, uploaderKey: string }>
  actualCost: number
}

interface DocumentSeed {
  pool: Pool
  type: 'CONTRACT' | 'BRIEF' | 'SPECIFICATION' | 'INVOICE' | 'ACT' | 'NDA' | 'OTHER'
  name: string
  onDay: number
  uploader: string
  /** Extra owner besides the project. */
  owner?: Record<string, string | null | undefined>
  /** Leave the project off: the document belongs to the studio, not the job. */
  noProject?: boolean
}

export async function seedFinance(
  staff: Staff,
  client: ClientInfo,
  production: Production,
  tasks: TaskRef[],
  review: ReviewSeedResult
): Promise<FinanceRefs> {
  const finance = staff.finance!
  const pm = staff.pm!
  const refs: FinanceRefs = { invoices: [], expenses: [], documents: [], actualCost: 0 }

  // ---- expenses and the budget they roll into ---------------------------
  for (const seed of EXPENSES) {
    const date = day(seed.onDay, 12)
    const row = await prisma.expense.create({
      data: {
        projectId: production.projectId,
        category: seed.category,
        description: seed.description,
        amount: seed.amount,
        currency: 'USD',
        date,
        createdById: finance.userId,
        createdAt: date
      }
    })
    refs.expenses.push({ id: row.id, amount: seed.amount, category: seed.category, date })
    refs.actualCost += seed.amount
  }
  await prisma.projectBudget.create({
    data: {
      projectId: production.projectId,
      revenue: 120000,
      plannedCost: 82000,
      actualCost: refs.actualCost,
      currency: 'USD',
      createdAt: day(-2, 14),
      updatedAt: day(127, 18)
    }
  })

  // ---- invoices, each paid by bank transfer ------------------------------
  for (const seed of INVOICES) {
    const issuedAt = day(seed.issued, 11)
    const paidAt = day(seed.paid, 14)
    const invoice = await prisma.invoice.create({
      data: {
        number: seed.number,
        clientId: client.id,
        projectId: production.projectId,
        amount: seed.amount,
        currency: 'USD',
        status: 'PAID',
        issuedAt,
        dueDate: day(seed.due, 18),
        createdAt: issuedAt,
        updatedAt: paidAt
      }
    })
    await prisma.payment.create({
      data: {
        clientId: client.id,
        projectId: production.projectId,
        invoiceId: invoice.id,
        amount: seed.amount,
        currency: 'USD',
        status: 'PAID',
        dueDate: day(seed.due, 18),
        paidDate: paidAt,
        method: 'bank transfer',
        createdAt: paidAt
      }
    })
    refs.invoices.push({ id: invoice.id, number: seed.number, amount: seed.amount, issuedAt, paidAt })
  }

  // ---- documents, attached to whatever they are about -------------------
  const departments = await prisma.department.findMany({ select: { id: true, name: true } })
  const departmentId = new Map(departments.map(d => [d.name, d.id]))
  const conceptTask = tasks.find(t => t.title.startsWith('Концепт'))
  const clientChanges = review.reviews.find(r => r.reviewerId === client.portalUserId && r.decision === 'changes_requested')
  const clientRevision = review.revisions.find(r => r.round === 2)
  const failedRender = review.renderJobs.find(r => r.status === 'FAILED')

  const DOCUMENTS: DocumentSeed[] = [
    { pool: 'pdf', type: 'NDA', name: 'NDA — 24reply LLC × Astir Studio', onDay: -8, uploader: 'producer', owner: { clientId: client.id } },
    { pool: 'pdf', type: 'CONTRACT', name: 'Договор № 14/2026 на производство роликов', onDay: -3, uploader: 'producer', owner: { clientId: client.id } },
    { pool: 'pdf', type: 'BRIEF', name: 'Бриф клиента — запуск 24reply.ai', onDay: 0, uploader: 'pm' },
    { pool: 'text', type: 'SPECIFICATION', name: 'Спецификация роликов (SPEC)', onDay: 4, uploader: 'pm' },
    { pool: 'xlsx', type: 'OTHER', name: 'Смета проекта', onDay: 2, uploader: 'finance' },
    { pool: 'pdf', type: 'INVOICE', name: 'Счёт INV-0001 — аванс 40 %', onDay: 1, uploader: 'finance' },
    { pool: 'pdf', type: 'OTHER', name: 'Референсы по стилю и маскоту', onDay: 14, uploader: 'ad', owner: { taskId: conceptTask?.id } },
    { pool: 'pdf', type: 'OTHER', name: 'Сценарий ролика 1 — Hero', onDay: 12, uploader: 'pm', owner: { episodeId: production.episodes[0]?.id } },
    { pool: 'pdf', type: 'OTHER', name: 'Сценарий ролика 2 — Как это работает', onDay: 12, uploader: 'pm', owner: { episodeId: production.episodes[1]?.id } },
    { pool: 'pdf', type: 'OTHER', name: 'Сценарий ролика 3 — Бот vs ИИ', onDay: 12, uploader: 'pm', owner: { episodeId: production.episodes[2]?.id } },
    { pool: 'pdf', type: 'OTHER', name: 'Раскадровка — сцена 1', onDay: 22, uploader: 'gulnora', owner: { sceneId: production.scenes[0]?.id } },
    { pool: 'pdf', type: 'OTHER', name: 'Раскадровка — сцена 2', onDay: 22, uploader: 'gulnora', owner: { sceneId: production.scenes[1]?.id } },
    { pool: 'pdf', type: 'OTHER', name: 'Раскадровка — сцена 5', onDay: 22, uploader: 'gulnora', owner: { sceneId: production.scenes[4]?.id } },
    { pool: 'pdf', type: 'INVOICE', name: 'Счёт INV-0002 — этап 30 %', onDay: 92, uploader: 'finance' },
    { pool: 'text', type: 'OTHER', name: 'Лог рендера — упавшая задача', onDay: 100, uploader: 'sherzod', owner: { renderJobId: failedRender?.id } },
    { pool: 'pdf', type: 'OTHER', name: 'Пометки клиента к финальному просмотру', onDay: 118, uploader: 'pm', owner: { reviewId: clientChanges?.id } },
    { pool: 'image', type: 'OTHER', name: 'Скриншот с правками клиента', onDay: 118, uploader: 'pm', owner: { revisionId: clientRevision?.id } },
    { pool: 'pdf', type: 'INVOICE', name: 'Счёт INV-0003 — финальный платёж', onDay: 127, uploader: 'finance' },
    { pool: 'docx', type: 'ACT', name: 'Акт приёма-передачи мастер-файлов', onDay: 127, uploader: 'pm', owner: { clientId: client.id } },
    { pool: 'csv', type: 'OTHER', name: 'Манифест мастер-файлов', onDay: 127, uploader: 'sherzod' },
    { pool: 'pdf', type: 'OTHER', name: 'Регламент отдела анимации', onDay: -120, uploader: 'anna', owner: { departmentId: departmentId.get('Animation') }, noProject: true },
    { pool: 'pdf', type: 'CONTRACT', name: 'Трудовой договор — Анна Волкова', onDay: -1000, uploader: 'finance', owner: { employeeId: staff.anna?.employeeId }, noProject: true }
  ]

  for (const seed of DOCUMENTS) {
    const owner = Object.fromEntries(Object.entries(seed.owner ?? {}).filter(([, value]) => Boolean(value))) as Record<string, string>
    const prefix = seed.noProject
      ? (owner.clientId ? 'clients/' + owner.clientId : 'shared')
      : 'projects/' + production.projectId
    const file = await attachNext(seed.pool, prefix, seed.name.replace(/[^\p{L}\p{N}]+/gu, '_'))
    if (!file) continue
    const createdAt = day(seed.onDay, 15)
    const row = await prisma.document.create({
      data: {
        projectId: seed.noProject ? null : production.projectId,
        ...owner,
        type: seed.type,
        name: seed.name + file.name.slice(file.name.lastIndexOf('.')),
        fileUrl: file.url,
        fileSize: BigInt(file.size),
        mimeType: file.mimeType,
        uploadedById: staff[seed.uploader]?.userId ?? pm.userId,
        createdAt
      }
    })
    refs.documents.push({ id: row.id, name: row.name, createdAt, uploaderKey: seed.uploader })
  }

  log('expenses: ' + refs.expenses.length + ' ($' + refs.actualCost + '), invoices: ' + refs.invoices.length +
    ' (all paid), documents: ' + refs.documents.length)
  return refs
}
