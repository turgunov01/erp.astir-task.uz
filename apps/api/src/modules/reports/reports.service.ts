import { prisma } from '../../lib/prisma'

/**
 * Reporting reads (spec 6).
 *
 * Everything here is derived at read time and nothing is stored: a report that
 * caches its own numbers becomes a second source of truth, and it starts
 * disagreeing with the records the moment anybody edits one.
 *
 * Monthly bucketing happens in JavaScript rather than in SQL. A studio's volume
 * fits in memory comfortably, and staying out of raw SQL keeps these queries
 * portable and typed.
 */

export interface Period {
  from: Date | null
  to: Date | null
}

/** A Prisma date filter for a period, or undefined when the period is open. */
function dateFilter(period: Period) {
  if (!period.from && !period.to) return undefined
  return {
    ...(period.from ? { gte: period.from } : {}),
    ...(period.to ? { lte: period.to } : {})
  }
}

const money = (value: unknown) => Number(value ?? 0)

/** YYYY-MM, the key every monthly bucket is grouped and sorted by. */
function monthKey(date: Date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
}

/* ------------------------------------------------------------- production */

const OPEN_TASK = ['BACKLOG', 'READY', 'IN_PROGRESS', 'REVIEW', 'REVISION', 'BLOCKED'] as const
const OPEN_REVISION = ['OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW'] as const

/**
 * One row per live project: how far along it is and what is holding it up.
 *
 * Archived and cancelled projects are left out — a report of what needs
 * attention should not be padded with work nobody is doing.
 */
export async function production(projectId?: string) {
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['ARCHIVED', 'CANCELLED'] },
      ...(projectId ? { id: projectId } : {})
    },
    orderBy: [{ deadline: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      risk: true,
      progress: true,
      deadline: true,
      stages: { select: { status: true } }
    }
  })

  const ids = projects.map(project => project.id)
  const now = new Date()

  const [tasksTotal, tasksDone, tasksOverdue, revisionsOpen] = await Promise.all([
    prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids } },
      _count: { _all: true }
    }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids }, status: { in: ['DONE', 'APPROVED'] } },
      _count: { _all: true }
    }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: {
        projectId: { in: ids },
        deadline: { lt: now },
        status: { in: [...OPEN_TASK] }
      },
      _count: { _all: true }
    }),
    prisma.revision.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids }, status: { in: [...OPEN_REVISION] } },
      _count: { _all: true }
    })
  ])

  const index = (rows: Array<{ projectId: string, _count: { _all: number } }>) =>
    new Map(rows.map(row => [row.projectId, row._count._all]))

  const total = index(tasksTotal)
  const done = index(tasksDone)
  const overdue = index(tasksOverdue)
  const revisions = index(revisionsOpen)

  return projects.map(project => ({
    id: project.id,
    code: project.code,
    name: project.name,
    status: project.status,
    risk: project.risk,
    progress: project.progress,
    deadline: project.deadline,
    // A deadline in the past on a project nobody has finished.
    late: Boolean(
      project.deadline &&
      project.deadline.getTime() < now.getTime() &&
      project.status !== 'COMPLETED'
    ),
    stagesTotal: project.stages.length,
    stagesDone: project.stages.filter(stage => stage.status === 'DONE').length,
    tasksTotal: total.get(project.id) ?? 0,
    tasksDone: done.get(project.id) ?? 0,
    tasksOverdue: overdue.get(project.id) ?? 0,
    revisionsOpen: revisions.get(project.id) ?? 0
  }))
}

/* -------------------------------------------------------------- financial */

const AGEING_BUCKETS = [
  { key: 'current', label: 'Не просрочено', upTo: 0 },
  { key: 'd30', label: '1-30 дней', upTo: 30 },
  { key: 'd60', label: '31-60 дней', upTo: 60 },
  { key: 'd90', label: '61-90 дней', upTo: 90 },
  { key: 'over90', label: 'Больше 90 дней', upTo: Number.POSITIVE_INFINITY }
] as const

/**
 * Money over time: invoiced, collected and spent, month by month.
 *
 * Receivables ageing counts every invoice that is neither paid nor cancelled,
 * including ones not yet due — "current" is the healthy bucket, and dropping it
 * would make a tidy ledger look empty rather than clean.
 */
export async function financial(period: Period) {
  const range = dateFilter(period)

  const [invoices, payments, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: range ? { issuedAt: range } : {},
      select: { amount: true, currency: true, issuedAt: true }
    }),
    prisma.payment.findMany({
      where: { status: 'PAID', ...(range ? { paidDate: range } : {}) },
      select: { amount: true, currency: true, paidDate: true }
    }),
    prisma.expense.findMany({
      where: range ? { date: range } : {},
      select: { amount: true, currency: true, category: true, date: true }
    })
  ])

  const months = new Map<string, {
    month: string
    invoiced: number
    collected: number
    spent: number
  }>()

  const bucket = (key: string) => {
    const existing = months.get(key)
    if (existing) return existing
    const created = { month: key, invoiced: 0, collected: 0, spent: 0 }
    months.set(key, created)
    return created
  }

  for (const invoice of invoices) {
    bucket(monthKey(invoice.issuedAt)).invoiced += money(invoice.amount)
  }
  for (const payment of payments) {
    if (payment.paidDate) bucket(monthKey(payment.paidDate)).collected += money(payment.amount)
  }
  for (const expense of expenses) {
    bucket(monthKey(expense.date)).spent += money(expense.amount)
  }

  const byMonth = [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(row => ({ ...row, net: row.collected - row.spent }))

  const categories = new Map<string, number>()
  for (const expense of expenses) {
    categories.set(expense.category, (categories.get(expense.category) ?? 0) + money(expense.amount))
  }
  const byCategory = [...categories.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  // Ageing describes what is owed right now, so it ignores the report period.
  const outstanding = await prisma.invoice.findMany({
    where: { status: { notIn: ['PAID', 'CANCELLED'] } },
    select: { amount: true, dueDate: true, issuedAt: true }
  })

  const now = Date.now()
  const ageing = AGEING_BUCKETS.map(entry => ({
    key: entry.key,
    label: entry.label,
    amount: 0,
    count: 0
  }))

  for (const invoice of outstanding) {
    const due = invoice.dueDate ?? invoice.issuedAt
    const daysLate = Math.floor((now - due.getTime()) / 86400000)
    const position = daysLate <= 0
      ? 0
      : AGEING_BUCKETS.findIndex(entry => daysLate <= entry.upTo)
    const slot = ageing[position === -1 ? ageing.length - 1 : position]
    if (!slot) continue
    slot.amount += money(invoice.amount)
    slot.count += 1
  }

  const totals = byMonth.reduce(
    (acc, row) => ({
      invoiced: acc.invoiced + row.invoiced,
      collected: acc.collected + row.collected,
      spent: acc.spent + row.spent
    }),
    { invoiced: 0, collected: 0, spent: 0 }
  )

  return {
    byMonth,
    byCategory,
    ageing,
    totals: { ...totals, net: totals.collected - totals.spent },
    /*
     * Every currency the rows carried. One total across several of them would
     * be adding dollars to som, so the interface needs to know when to say so.
     */
    currencies: [...new Set([
      ...invoices.map(row => row.currency),
      ...payments.map(row => row.currency),
      ...expenses.map(row => row.currency)
    ])]
  }
}

/* ------------------------------------------------------------------- time */

/**
 * Logged hours by person, priced at each employee's rate.
 *
 * Hours without a rate are counted but cost nothing, and they are reported
 * separately: a suspiciously cheap month is usually missing rates, not cheap.
 */
export async function time(period: Period, projectId?: string) {
  const range = dateFilter(period)

  const entries = await prisma.timesheetEntry.findMany({
    where: {
      ...(range ? { date: range } : {}),
      ...(projectId ? { projectId } : {})
    },
    select: {
      hours: true,
      projectId: true,
      employee: {
        select: {
          id: true,
          position: true,
          hourlyRate: true,
          user: { select: { firstName: true, lastName: true } },
          department: { select: { name: true } }
        }
      }
    }
  })

  const people = new Map<string, {
    id: string
    name: string
    position: string
    department: string | null
    hourlyRate: number | null
    hours: number
    unpricedHours: number
    cost: number
    projects: Set<string>
  }>()

  for (const entry of entries) {
    const employee = entry.employee
    if (!employee) continue

    const person = people.get(employee.id) ?? {
      id: employee.id,
      name: employee.user.firstName + ' ' + employee.user.lastName,
      position: employee.position,
      department: employee.department?.name ?? null,
      hourlyRate: employee.hourlyRate ? money(employee.hourlyRate) : null,
      hours: 0,
      unpricedHours: 0,
      cost: 0,
      projects: new Set<string>()
    }

    const hours = money(entry.hours)
    const rate = person.hourlyRate ?? 0
    person.hours += hours
    if (rate === 0) person.unpricedHours += hours
    person.cost += hours * rate
    person.projects.add(entry.projectId)
    people.set(employee.id, person)
  }

  const round = (value: number) => Math.round(value * 100) / 100

  const rows = [...people.values()]
    .map(person => ({
      id: person.id,
      name: person.name,
      position: person.position,
      department: person.department,
      hourlyRate: person.hourlyRate,
      hours: round(person.hours),
      unpricedHours: round(person.unpricedHours),
      cost: round(person.cost),
      projects: person.projects.size
    }))
    .sort((a, b) => b.hours - a.hours)

  return {
    rows,
    totals: {
      hours: round(rows.reduce((sum, row) => sum + row.hours, 0)),
      unpricedHours: round(rows.reduce((sum, row) => sum + row.unpricedHours, 0)),
      cost: round(rows.reduce((sum, row) => sum + row.cost, 0)),
      people: rows.length
    }
  }
}

/* ---------------------------------------------------------------- clients */

/**
 * One row per client: billed, paid, and what is left.
 *
 * Days-to-pay runs from the invoice date to its last recorded payment, averaged
 * over invoices that are actually settled. An unpaid invoice has no duration
 * yet, and counting it as zero would drag the average toward flattery.
 */
export async function clients(period: Period) {
  const range = dateFilter(period)

  const rows = await prisma.client.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      status: true,
      _count: { select: { projects: true } },
      invoices: {
        where: range ? { issuedAt: range } : {},
        select: {
          amount: true,
          currency: true,
          issuedAt: true,
          payments: {
            where: { status: 'PAID' },
            select: { amount: true, paidDate: true }
          }
        }
      }
    }
  })

  return rows.map(client => {
    let invoiced = 0
    let collected = 0
    const settledDays: number[] = []

    for (const invoice of client.invoices) {
      const amount = money(invoice.amount)
      const paid = invoice.payments.reduce((sum, payment) => sum + money(payment.amount), 0)
      invoiced += amount
      collected += paid

      const dates = invoice.payments
        .map(payment => payment.paidDate)
        .filter((date): date is Date => Boolean(date))
      if (amount > 0 && paid >= amount && dates.length > 0) {
        const last = Math.max(...dates.map(date => date.getTime()))
        settledDays.push(Math.max(0, Math.round((last - invoice.issuedAt.getTime()) / 86400000)))
      }
    }

    return {
      id: client.id,
      name: client.name,
      status: client.status,
      projects: client._count.projects,
      invoices: client.invoices.length,
      currency: client.invoices[0]?.currency ?? 'USD',
      invoiced,
      collected,
      outstanding: invoiced - collected,
      avgDaysToPay: settledDays.length > 0
        ? Math.round(settledDays.reduce((sum, days) => sum + days, 0) / settledDays.length)
        : null
    }
  })
}
