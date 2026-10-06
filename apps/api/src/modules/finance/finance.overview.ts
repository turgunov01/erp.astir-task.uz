import { PERMISSION, type Role } from '@astir/types'
import { prisma } from '../../lib/prisma'
import { hasPermission } from '../../lib/rbac'
import { dayEnd, dayStart, OPEN_INVOICE, overdueInvoiceWhere } from './finance.filters'
import { cents, daysPastDue, labourByProject, paidByInvoice, withCollection } from './finance.service'
import { summary as payrollSummary } from './payroll.service'

/**
 * The finance dashboard for one period (client: «уточнить дополнительные
 * данные» on the finance page).
 *
 * Every figure is aggregated in the database with groupBy — a fixed handful of
 * queries whatever the size of the ledger — and every money figure is split by
 * currency: adding som to dollars produces a number nobody is owed.
 *
 * Cash basis: "in" is what clients actually paid in the period, "out" is the
 * expenses dated in it. Receivables and overdue invoices describe today, not
 * the period, because a debt is owed now or not at all.
 */

const amountOf = (value: unknown) => Number(value ?? 0)

/** YYYY-MM of a stored date, read in UTC like the date columns themselves. */
const monthOf = (date: Date) => date.toISOString().slice(0, 7)

/** Every month the period touches, oldest first, so empty months still show. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  const cursor = new Date(from.slice(0, 7) + '-01T00:00:00.000Z')
  const last = to.slice(0, 7)
  // Bounded: a custom range of decades should not build an endless axis.
  while (months.length < 120) {
    const key = monthOf(cursor)
    months.push(key)
    if (key >= last) break
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return months
}

export interface OverviewInput {
  from: string
  to: string
  user: { id: string, role: Role }
}

interface CurrencyKpi {
  currency: string
  inflow: number
  fees: number
  outflow: number
  profit: number
  invoiced: number
  receivable: number
  overdue: number
  overdueCount: number
  payrollNet: number | null
}

const UPCOMING_DAYS = 14
const LIST_SIZE = 8
const STOPPED_PROJECTS = ['CANCELLED', 'ARCHIVED'] as const

async function cashflow(from: Date, to: Date) {
  const [inflow, outflow, invoiced] = await Promise.all([
    prisma.payment.groupBy({
      by: ['currency', 'paidDate'],
      where: { status: 'PAID', paidDate: { gte: from, lte: to } },
      _sum: { amount: true, fee: true }
    }),
    prisma.expense.groupBy({
      by: ['currency', 'date'],
      where: { date: { gte: from, lte: to } },
      _sum: { amount: true }
    }),
    prisma.invoice.groupBy({
      by: ['currency'],
      where: { issuedAt: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
      _sum: { amount: true }
    })
  ])
  return { inflow, outflow, invoiced }
}

async function receivables(now: Date) {
  const late = overdueInvoiceWhere(now)
  const [open, paidOpen, overdue, paidOverdue] = await Promise.all([
    prisma.invoice.groupBy({ by: ['currency'], where: OPEN_INVOICE, _sum: { amount: true } }),
    prisma.payment.groupBy({
      by: ['currency'], where: { status: 'PAID', invoice: OPEN_INVOICE }, _sum: { amount: true }
    }),
    prisma.invoice.groupBy({ by: ['currency'], where: late, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.groupBy({
      by: ['currency'], where: { status: 'PAID', invoice: late }, _sum: { amount: true }
    })
  ])
  return { open, paidOpen, overdue, paidOverdue }
}

async function expensesByCategory(from: Date, to: Date) {
  const rows = await prisma.expense.groupBy({
    by: ['currency', 'category'],
    where: { date: { gte: from, lte: to } },
    _sum: { amount: true },
    _count: { _all: true }
  })
  return rows
    .map(row => ({
      currency: row.currency,
      category: row.category,
      amount: cents(amountOf(row._sum.amount)),
      count: row._count._all
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency) || b.amount - a.amount)
}

/**
 * Project profitability, cumulative up to the end of the period: a budget is
 * a whole-project figure, so it is compared with the whole-project fact.
 */
async function projectTable(to: Date) {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { notIn: [...STOPPED_PROJECTS] } },
    select: {
      id: true, code: true, name: true, status: true, currency: true, budget: true,
      client: { select: { id: true, name: true } },
      budgetRecord: { select: { revenue: true, plannedCost: true, currency: true } }
    },
    orderBy: { code: 'asc' }
  })
  const ids = projects.map(project => project.id)
  if (ids.length === 0) return []

  const [spent, collected, invoiced, labour] = await Promise.all([
    prisma.expense.groupBy({
      by: ['projectId', 'currency'],
      where: { projectId: { in: ids }, date: { lte: to } },
      _sum: { amount: true }
    }),
    prisma.payment.groupBy({
      by: ['projectId', 'currency'],
      where: { projectId: { in: ids }, status: 'PAID', paidDate: { lte: to } },
      _sum: { amount: true }
    }),
    prisma.invoice.groupBy({
      by: ['projectId', 'currency'],
      where: { projectId: { in: ids }, issuedAt: { lte: to }, status: { not: 'CANCELLED' } },
      _sum: { amount: true }
    }),
    labourByProject(ids, to)
  ])

  return projects.map(project => {
    const currency = project.budgetRecord?.currency ?? project.currency
    const other = new Set<string>()
    const pick = (list: Array<{ projectId: string | null, currency: string, _sum: { amount: unknown } }>) => {
      let total = 0
      for (const row of list) {
        if (row.projectId !== project.id) continue
        if (row.currency === currency) total += amountOf(row._sum.amount)
        else other.add(row.currency)
      }
      return total
    }

    const expenses = pick(spent)
    const labourCost = labour.get(project.id)?.cost ?? 0
    const actualCost = expenses + labourCost
    const received = pick(collected)
    const plannedCost = amountOf(project.budgetRecord?.plannedCost)
    const revenue = amountOf(project.budgetRecord?.revenue ?? project.budget)
    const margin = received - actualCost

    return {
      id: project.id,
      code: project.code,
      name: project.name,
      status: project.status,
      client: project.client,
      currency,
      hasBudget: project.budgetRecord !== null,
      revenue: cents(revenue),
      plannedCost: cents(plannedCost),
      expenses: cents(expenses),
      labour: cents(labourCost),
      actualCost: cents(actualCost),
      invoiced: cents(pick(invoiced)),
      collected: cents(received),
      margin: cents(margin),
      /** Margin on what was actually received; null before any money came in. */
      marginPct: received > 0 ? Math.round((margin / received) * 100) : null,
      /** Share of the planned cost already spent; null without a plan. */
      burnPct: plannedCost > 0 ? Math.round((actualCost / plannedCost) * 100) : null,
      otherCurrencies: [...other].sort()
    }
  })
    // A project with no money on either side has nothing to say here.
    .filter(row => row.hasBudget || row.actualCost > 0 || row.collected > 0 || row.invoiced > 0)
    .sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0) || a.code.localeCompare(b.code))
}

/** The overdue invoices and those falling due soon, with what is left on each. */
async function invoiceWatch(now: Date) {
  const soon = new Date(now.getTime() + UPCOMING_DAYS * 86400000)
  const select = {
    id: true, number: true, amount: true, currency: true, status: true,
    issuedAt: true, dueDate: true,
    client: { select: { id: true, name: true } },
    project: { select: { id: true, code: true } }
  } as const
  const [overdue, upcoming, upcomingCount] = await Promise.all([
    prisma.invoice.findMany({
      where: overdueInvoiceWhere(now),
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
      take: LIST_SIZE,
      select
    }),
    prisma.invoice.findMany({
      where: { ...OPEN_INVOICE, status: { notIn: ['PAID', 'CANCELLED', 'OVERDUE'] }, dueDate: { gte: now, lte: soon } },
      orderBy: { dueDate: 'asc' },
      take: LIST_SIZE,
      select
    }),
    prisma.invoice.count({
      where: { ...OPEN_INVOICE, status: { notIn: ['PAID', 'CANCELLED', 'OVERDUE'] }, dueDate: { gte: now, lte: soon } }
    })
  ])
  const paid = await paidByInvoice([...overdue, ...upcoming].map(row => row.id))
  const shape = <T extends { id: string, amount: unknown, status: string, dueDate: Date | null }>(row: T) => {
    const full = withCollection(row, paid, now)
    return {
      ...full,
      amount: amountOf(row.amount),
      daysLeft: row.dueDate && row.dueDate >= now ? Math.ceil((row.dueDate.getTime() - now.getTime()) / 86400000) : 0,
      daysLate: full.overdue ? daysPastDue(row.dueDate, now) : 0
    }
  }
  return {
    overdue: overdue.map(shape),
    upcoming: upcoming.map(shape),
    upcomingCount,
    upcomingDays: UPCOMING_DAYS
  }
}

/**
 * Pay for the month the period ends in (never a future month): the roll-up
 * payroll itself shows, plus every approved advance, fine and bonus over the
 * whole period. Read only, and only for callers allowed to see everyone's pay.
 */
async function payrollBlock(months: string[], user: OverviewInput['user']) {
  if (!(await hasPermission(user.role, PERMISSION.PAYROLL_VIEW))) return null
  const current = new Date().toISOString().slice(0, 7)
  const month = months.filter(key => key <= current).at(-1) ?? current

  const [monthSummary, byType] = await Promise.all([
    payrollSummary(month, { ownEmployeeId: null }),
    prisma.payrollEntry.groupBy({
      by: ['type', 'currency'],
      where: { period: { in: months }, status: { in: ['APPROVED', 'PAID'] } },
      _sum: { amount: true },
      _count: { _all: true }
    })
  ])

  return {
    month,
    // People without a salary on file are listed at zero in the studio
    // currency; a currency that is zero across the board says nothing here.
    totals: monthSummary.totals.filter(row =>
      row.salary !== 0 || row.accrued !== 0 || row.withheld !== 0 || row.advances !== 0 || row.drafts !== 0),
    period: byType
      .map(row => ({
        type: row.type,
        currency: row.currency,
        amount: cents(amountOf(row._sum.amount)),
        count: row._count._all
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency) || a.type.localeCompare(b.type))
  }
}

export async function financeOverview(input: OverviewInput) {
  const now = new Date()
  const from = dayStart(input.from)
  const to = dayEnd(input.to)
  const months = monthsBetween(input.from, input.to)

  const [flow, debt, categories, projects, invoices, payroll] = await Promise.all([
    cashflow(from, to),
    receivables(now),
    expensesByCategory(from, to),
    projectTable(to),
    invoiceWatch(now),
    payrollBlock(months, input.user)
  ])

  // Month by month, per currency: the series behind the cash-flow chart.
  const series = new Map<string, { inflow: number[], outflow: number[] }>()
  const seriesFor = (currency: string) => {
    let entry = series.get(currency)
    if (!entry) {
      entry = { inflow: months.map(() => 0), outflow: months.map(() => 0) }
      series.set(currency, entry)
    }
    return entry
  }
  for (const row of flow.inflow) {
    if (!row.paidDate) continue
    const index = months.indexOf(monthOf(row.paidDate))
    if (index >= 0) seriesFor(row.currency).inflow[index]! += amountOf(row._sum.amount)
  }
  for (const row of flow.outflow) {
    const index = months.indexOf(monthOf(row.date))
    if (index >= 0) seriesFor(row.currency).outflow[index]! += amountOf(row._sum.amount)
  }

  const currencies = new Set<string>([
    ...series.keys(),
    ...flow.invoiced.map(row => row.currency),
    ...debt.open.map(row => row.currency),
    ...(payroll?.totals.map(row => row.currency) ?? [])
  ])

  const sumIn = (list: Array<{ currency: string, _sum: { amount: unknown } }>, currency: string) =>
    list.filter(row => row.currency === currency).reduce((sum, row) => sum + amountOf(row._sum.amount), 0)

  const kpis: CurrencyKpi[] = [...currencies].sort().map(currency => {
    const inflow = series.get(currency)?.inflow.reduce((a, b) => a + b, 0) ?? 0
    const outflow = series.get(currency)?.outflow.reduce((a, b) => a + b, 0) ?? 0
    const fees = flow.inflow
      .filter(row => row.currency === currency)
      .reduce((sum, row) => sum + amountOf(row._sum.fee), 0)
    const overdueRow = debt.overdue.find(row => row.currency === currency)
    const payrollRow = payroll?.totals.find(row => row.currency === currency)
    return {
      currency,
      inflow: cents(inflow),
      fees: cents(fees),
      outflow: cents(outflow),
      profit: cents(inflow - fees - outflow),
      invoiced: cents(sumIn(flow.invoiced, currency)),
      receivable: cents(Math.max(0, sumIn(debt.open, currency) - sumIn(debt.paidOpen, currency))),
      overdue: cents(Math.max(0, sumIn(debt.overdue, currency) - sumIn(debt.paidOverdue, currency))),
      overdueCount: overdueRow?._count._all ?? 0,
      payrollNet: payrollRow ? payrollRow.net : null
    }
  })

  return {
    period: { from: input.from, to: input.to, months },
    currencies: kpis.map(row => row.currency),
    kpis,
    cashflow: [...series.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, entry]) => ({
        currency,
        months: months.map((month, index) => ({
          month,
          inflow: cents(entry.inflow[index] ?? 0),
          outflow: cents(entry.outflow[index] ?? 0)
        }))
      })),
    expensesByCategory: categories,
    projects,
    invoices,
    payroll
  }
}
