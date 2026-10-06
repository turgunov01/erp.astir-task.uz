import type { ExpenseCategory, Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { notFound } from '../../lib/errors'
import { OPEN_INVOICE, overdueInvoiceWhere } from './finance.filters'

/**
 * Project profitability (spec 43).
 *
 * Actual cost is not a stored number anyone types: it is expenses plus the
 * hours logged against the project priced at each employee's rate. Hours
 * without a rate contribute zero rather than guessing a studio average.
 */
export async function profitability(projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true, code: true, name: true, currency: true, budget: true,
      budgetRecord: { select: { revenue: true, plannedCost: true } }
    }
  })
  if (!project) throw notFound('Project')

  const [expenseRows, timesheets, payments] = await Promise.all([
    prisma.expense.groupBy({
      by: ['category'],
      where: { projectId },
      _sum: { amount: true }
    }),
    prisma.timesheetEntry.findMany({
      where: { projectId },
      select: { hours: true, employee: { select: { hourlyRate: true } } }
    }),
    prisma.payment.aggregate({
      where: { projectId, status: 'PAID' },
      _sum: { amount: true }
    })
  ])

  const expenses = expenseRows.map(row => ({
    category: row.category,
    amount: Number(row._sum.amount ?? 0)
  }))
  const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0)

  let labourCost = 0
  let unpricedHours = 0
  for (const entry of timesheets) {
    const rate = entry.employee?.hourlyRate ? Number(entry.employee.hourlyRate) : 0
    const hours = Number(entry.hours)
    if (rate === 0) unpricedHours += hours
    labourCost += hours * rate
  }

  const revenue = Number(project.budgetRecord?.revenue ?? project.budget ?? 0)
  const plannedCost = Number(project.budgetRecord?.plannedCost ?? 0)
  const actualCost = expenseTotal + labourCost
  const profit = revenue - actualCost
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0

  return {
    project: { id: project.id, code: project.code, name: project.name, currency: project.currency },
    revenue,
    plannedCost,
    actualCost,
    expenseTotal,
    labourCost,
    // Surfaced so a suspiciously low cost can be explained rather than trusted.
    unpricedHours,
    collected: Number(payments._sum.amount ?? 0),
    profit,
    margin,
    expenses
  }
}

/** Two decimals, so float drift from the sums never reaches the screen. */
export const cents = (value: number) => Math.round(value * 100) / 100

const amountOf = (value: unknown) => Number(value ?? 0)

const byCurrency = <T extends { currency: string }>(rows: T[]) =>
  rows.slice().sort((a, b) => a.currency.localeCompare(b.currency))

/* ------------------------------------------------------------------ lists */

export interface ExpenseSummary {
  currency: string
  amount: number
  vat: number
  count: number
}

export const expenseInclude = {
  project: { select: { id: true, code: true, client: { select: { id: true, name: true } } } },
  createdBy: { select: { firstName: true, lastName: true } }
} satisfies Prisma.ExpenseInclude

/**
 * A page of expenses and the totals of everything the filter matched.
 *
 * Totals are per currency and cover all matching rows, not the visible page:
 * a page sum answers nothing anybody asks.
 */
export async function listExpenses(where: Prisma.ExpenseWhereInput, skip: number, take: number) {
  const [items, total, sums] = await Promise.all([
    prisma.expense.findMany({
      where, skip, take,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: expenseInclude
    }),
    prisma.expense.count({ where }),
    prisma.expense.groupBy({
      by: ['currency'],
      where,
      _sum: { amount: true, vatAmount: true },
      _count: { _all: true }
    })
  ])
  const summary: ExpenseSummary[] = byCurrency(sums.map(row => ({
    currency: row.currency,
    amount: cents(amountOf(row._sum.amount)),
    vat: cents(amountOf(row._sum.vatAmount)),
    count: row._count._all
  })))
  return [items, total, summary] as const
}

export interface PaymentSummary {
  currency: string
  /** Every matching payment, whatever its status. */
  amount: number
  /** Received: status PAID. */
  paid: number
  /** Still expected: neither paid nor cancelled. */
  expected: number
  /** Bank commission on the received ones. */
  fee: number
  count: number
}

export const paymentInclude = {
  client: { select: { id: true, name: true } },
  project: { select: { id: true, code: true } },
  invoice: { select: { id: true, number: true } }
} satisfies Prisma.PaymentInclude

export async function listPayments(where: Prisma.PaymentWhereInput, skip: number, take: number) {
  const [items, total, sums] = await Promise.all([
    prisma.payment.findMany({
      where, skip, take,
      orderBy: [{ paidDate: { sort: 'desc', nulls: 'first' } }, { dueDate: 'desc' }],
      include: paymentInclude
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({
      by: ['currency', 'status'],
      where,
      _sum: { amount: true, fee: true },
      _count: { _all: true }
    })
  ])

  const totals = new Map<string, PaymentSummary>()
  for (const row of sums) {
    const entry = totals.get(row.currency) ??
      { currency: row.currency, amount: 0, paid: 0, expected: 0, fee: 0, count: 0 }
    const amount = amountOf(row._sum.amount)
    entry.amount += amount
    entry.count += row._count._all
    if (row.status === 'PAID') {
      entry.paid += amount
      entry.fee += amountOf(row._sum.fee)
    } else if (row.status !== 'CANCELLED') {
      entry.expected += amount
    }
    totals.set(row.currency, entry)
  }
  const summary = byCurrency([...totals.values()].map(row => ({
    ...row,
    amount: cents(row.amount),
    paid: cents(row.paid),
    expected: cents(row.expected),
    fee: cents(row.fee)
  })))
  return [items, total, summary] as const
}

export interface InvoiceSummary {
  currency: string
  amount: number
  paid: number
  /** Left to collect on invoices that are neither paid nor cancelled. */
  outstanding: number
  overdue: number
  overdueCount: number
  count: number
}

/** Whole days an invoice is past its due date; 0 when it is not. */
export function daysPastDue(dueDate: Date | null, now: Date): number {
  if (!dueDate) return 0
  return Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000))
}

/** Sum of PAID payments per invoice, in one query for the whole page. */
export async function paidByInvoice(invoiceIds: string[]) {
  if (invoiceIds.length === 0) return new Map<string, number>()
  const paid = await prisma.payment.groupBy({
    by: ['invoiceId'],
    where: { invoiceId: { in: invoiceIds }, status: 'PAID' },
    _sum: { amount: true }
  })
  return new Map(paid.map(row => [row.invoiceId as string, amountOf(row._sum.amount)]))
}

/** An invoice row with what has been collected on it and what is left. */
export function withCollection<T extends { id: string, amount: unknown, status: string, dueDate: Date | null }>(
  invoice: T,
  paid: Map<string, number>,
  now: Date
) {
  const paidTotal = cents(paid.get(invoice.id) ?? 0)
  const open = invoice.status !== 'PAID' && invoice.status !== 'CANCELLED'
  const remaining = open ? cents(Math.max(0, amountOf(invoice.amount) - paidTotal)) : 0
  const overdue = open && (invoice.status === 'OVERDUE' || (invoice.dueDate !== null && invoice.dueDate < now))
  return { ...invoice, paidTotal, remaining, overdue, daysLate: overdue ? daysPastDue(invoice.dueDate, now) : 0 }
}

export const invoiceInclude = {
  client: { select: { id: true, name: true } },
  project: { select: { id: true, code: true } },
  _count: { select: { payments: true } }
} satisfies Prisma.InvoiceInclude

export async function listInvoices(
  where: Prisma.InvoiceWhereInput,
  skip: number,
  take: number,
  now = new Date()
) {
  const openWhere: Prisma.InvoiceWhereInput = { AND: [where, OPEN_INVOICE] }
  const lateWhere: Prisma.InvoiceWhereInput = { AND: [where, overdueInvoiceWhere(now)] }

  const [items, total, sums, paid, paidOpen, late, paidLate] = await Promise.all([
    prisma.invoice.findMany({
      where, skip, take,
      orderBy: [{ issuedAt: 'desc' }, { number: 'desc' }],
      include: invoiceInclude
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.groupBy({
      by: ['currency', 'status'],
      where,
      _sum: { amount: true },
      _count: { _all: true }
    }),
    prisma.payment.groupBy({
      by: ['currency'], where: { status: 'PAID', invoice: where }, _sum: { amount: true }
    }),
    prisma.payment.groupBy({
      by: ['currency'], where: { status: 'PAID', invoice: openWhere }, _sum: { amount: true }
    }),
    prisma.invoice.groupBy({
      by: ['currency'], where: lateWhere, _sum: { amount: true }, _count: { _all: true }
    }),
    prisma.payment.groupBy({
      by: ['currency'], where: { status: 'PAID', invoice: lateWhere }, _sum: { amount: true }
    })
  ])

  // How much each invoice has actually collected travels with the row, so the
  // table can show cover without one request per line.
  const paidMap = await paidByInvoice(items.map(invoice => invoice.id))
  const rows = items.map(invoice => withCollection(invoice, paidMap, now))

  const sumOf = (list: Array<{ currency: string, _sum: { amount: unknown } }>, currency: string) =>
    amountOf(list.find(row => row.currency === currency)?._sum.amount)

  const totals = new Map<string, { amount: number, open: number, count: number }>()
  for (const row of sums) {
    const entry = totals.get(row.currency) ?? { amount: 0, open: 0, count: 0 }
    const amount = amountOf(row._sum.amount)
    entry.count += row._count._all
    if (row.status !== 'CANCELLED') entry.amount += amount
    if (row.status !== 'CANCELLED' && row.status !== 'PAID') entry.open += amount
    totals.set(row.currency, entry)
  }

  const summary: InvoiceSummary[] = byCurrency([...totals.entries()].map(([currency, entry]) => {
    const lateRow = late.find(row => row.currency === currency)
    return {
      currency,
      amount: cents(entry.amount),
      paid: cents(sumOf(paid, currency)),
      outstanding: cents(Math.max(0, entry.open - sumOf(paidOpen, currency))),
      overdue: cents(Math.max(0, amountOf(lateRow?._sum.amount) - sumOf(paidLate, currency))),
      overdueCount: lateRow?._count._all ?? 0,
      count: entry.count
    }
  }))

  return [rows, total, summary] as const
}

/* --------------------------------------------------------------- labour */

/**
 * Logged hours priced at each employee's rate, per project — two queries for
 * any number of projects. Hours without a rate cost nothing and are counted
 * apart, the way profitability() reports them.
 */
export async function labourByProject(projectIds: string[], upTo?: Date) {
  const result = new Map<string, { cost: number, unpricedHours: number }>()
  if (projectIds.length === 0) return result

  const hours = await prisma.timesheetEntry.groupBy({
    by: ['projectId', 'employeeId'],
    where: { projectId: { in: projectIds }, ...(upTo ? { date: { lte: upTo } } : {}) },
    _sum: { hours: true }
  })
  const employees = await prisma.employee.findMany({
    where: { id: { in: [...new Set(hours.map(row => row.employeeId))] } },
    select: { id: true, hourlyRate: true }
  })
  const rate = new Map(employees.map(row => [row.id, amountOf(row.hourlyRate)]))

  for (const row of hours) {
    const entry = result.get(row.projectId) ?? { cost: 0, unpricedHours: 0 }
    const logged = amountOf(row._sum.hours)
    const price = rate.get(row.employeeId) ?? 0
    if (price === 0) entry.unpricedHours += logged
    entry.cost += logged * price
    result.set(row.projectId, entry)
  }
  return result
}

/* ---------------------------------------------------------------- budgets */

export const budgetInclude = {
  project: {
    select: {
      id: true, code: true, name: true, status: true, currency: true,
      client: { select: { id: true, name: true } }
    }
  },
  lines: { select: { id: true, category: true, plannedAmount: true }, orderBy: { category: 'asc' } }
} satisfies Prisma.ProjectBudgetInclude

/**
 * Budgets with their fact next to the plan: spent per category, labour,
 * collected and invoiced, and how much of the planned cost is used up.
 *
 * Only money in the budget's own currency counts towards it. Anything in
 * another currency is named, not converted — there is no rate to convert with.
 */
export async function listBudgets() {
  const budgets = await prisma.projectBudget.findMany({
    include: budgetInclude,
    orderBy: { createdAt: 'desc' }
  })
  const projectIds = budgets.map(budget => budget.projectId)
  if (projectIds.length === 0) return []

  const [spent, collected, invoiced, labour] = await Promise.all([
    prisma.expense.groupBy({
      by: ['projectId', 'category', 'currency'],
      where: { projectId: { in: projectIds } },
      _sum: { amount: true }
    }),
    prisma.payment.groupBy({
      by: ['projectId', 'currency'],
      where: { projectId: { in: projectIds }, status: 'PAID' },
      _sum: { amount: true }
    }),
    prisma.invoice.groupBy({
      by: ['projectId', 'currency'],
      where: { projectId: { in: projectIds }, status: { not: 'CANCELLED' } },
      _sum: { amount: true }
    }),
    labourByProject(projectIds)
  ])

  return budgets.map(budget => {
    const currency = budget.currency
    const otherCurrencies = new Set<string>()
    const actualByCategory = new Map<string, number>()
    for (const row of spent) {
      if (row.projectId !== budget.projectId) continue
      if (row.currency !== currency) {
        otherCurrencies.add(row.currency)
        continue
      }
      actualByCategory.set(row.category, (actualByCategory.get(row.category) ?? 0) + amountOf(row._sum.amount))
    }
    const inCurrency = (list: Array<{ projectId: string | null, currency: string, _sum: { amount: unknown } }>) => {
      let total = 0
      for (const row of list) {
        if (row.projectId !== budget.projectId) continue
        if (row.currency === currency) total += amountOf(row._sum.amount)
        else otherCurrencies.add(row.currency)
      }
      return total
    }

    const categories = new Set<string>([
      ...budget.lines.map(line => line.category),
      ...actualByCategory.keys()
    ])
    const planned = new Map(budget.lines.map(line => [line.category as string, amountOf(line.plannedAmount)]))
    const byCategory = [...categories].map(category => ({
      category,
      planned: cents(planned.get(category) ?? 0),
      actual: cents(actualByCategory.get(category) ?? 0)
    })).sort((a, b) => b.planned - a.planned || b.actual - a.actual)

    const expenses = [...actualByCategory.values()].reduce((sum, value) => sum + value, 0)
    const labourCost = labour.get(budget.projectId)?.cost ?? 0
    const actualCost = expenses + labourCost
    const plannedCost = amountOf(budget.plannedCost)

    return {
      ...budget,
      actual: {
        expenses: cents(expenses),
        labour: cents(labourCost),
        cost: cents(actualCost),
        collected: cents(inCurrency(collected)),
        invoiced: cents(inCurrency(invoiced)),
        /** Share of the planned cost already spent, null without a plan. */
        burn: plannedCost > 0 ? Math.round((actualCost / plannedCost) * 100) : null,
        unpricedHours: labour.get(budget.projectId)?.unpricedHours ?? 0
      },
      byCategory,
      otherCurrencies: [...otherCurrencies].sort()
    }
  })
}

export interface BudgetLineInput {
  category: ExpenseCategory
  plannedAmount: number
}

/**
 * Replace a budget's category plan in one go.
 *
 * The editor sends the whole breakdown, so replacing is the honest write: a
 * category the user cleared disappears instead of lingering at its old value.
 */
export async function replaceBudgetLines(budgetId: string, lines: BudgetLineInput[]) {
  const budget = await prisma.projectBudget.findUnique({ where: { id: budgetId }, select: { id: true } })
  if (!budget) throw notFound('Budget')
  const kept = lines.filter(line => line.plannedAmount > 0)
  await prisma.$transaction([
    prisma.projectBudgetLine.deleteMany({ where: { budgetId } }),
    prisma.projectBudgetLine.createMany({
      data: kept.map(line => ({ budgetId, category: line.category, plannedAmount: line.plannedAmount }))
    })
  ])
  return prisma.projectBudget.findUniqueOrThrow({ where: { id: budgetId }, include: budgetInclude })
}

const INVOICE_PREFIX = 'INV-'

/**
 * Next free INV-nnnn number, mirroring how a project derives its AST-nnn code.
 *
 * An explicit number from the caller wins. The column is unique, so a racing
 * second creation fails loudly rather than silently reusing a number — which is
 * the right outcome for a document a client will quote back at you.
 */
export async function nextInvoiceNumber(): Promise<string> {
  const existing = await prisma.invoice.findMany({
    where: { number: { startsWith: INVOICE_PREFIX } },
    select: { number: true }
  })
  const highest = existing.reduce((max, row) => {
    const value = Number.parseInt(row.number.slice(INVOICE_PREFIX.length), 10)
    return Number.isFinite(value) && value > max ? value : max
  }, 0)
  return INVOICE_PREFIX + String(highest + 1).padStart(4, '0')
}

/**
 * How much of one invoice its payments actually cover.
 *
 * Recording a payment never changes an invoice on its own: the interface asks
 * first, and this is the number it asks with (spec 43). Keeping the decision
 * with the user means no invoice is ever closed by a side effect nobody saw.
 */
export async function invoiceCoverage(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, number: true, amount: true, currency: true, status: true }
  })
  if (!invoice) throw notFound('Invoice')

  const paid = await prisma.payment.aggregate({
    where: { invoiceId: id, status: 'PAID' },
    _sum: { amount: true }
  })
  const paidTotal = Number(paid._sum.amount ?? 0)
  const amount = Number(invoice.amount)

  return {
    id: invoice.id,
    number: invoice.number,
    currency: invoice.currency,
    status: invoice.status,
    amount,
    paidTotal,
    covered: amount > 0 && paidTotal >= amount
  }
}
