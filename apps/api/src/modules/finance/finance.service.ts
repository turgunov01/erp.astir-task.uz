import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { notFound } from '../../lib/errors'

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

/** Portfolio-level roll-up for the finance overview. */
export async function overview() {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { notIn: ['CANCELLED', 'ARCHIVED'] } },
    select: { id: true }
  })

  const rows = await Promise.all(projects.map(project => profitability(project.id)))

  const totals = rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      actualCost: acc.actualCost + row.actualCost,
      profit: acc.profit + row.profit,
      collected: acc.collected + row.collected
    }),
    { revenue: 0, actualCost: 0, profit: 0, collected: 0 }
  )

  const [overdueInvoices, pendingPayments] = await Promise.all([
    prisma.invoice.count({ where: { status: 'OVERDUE' } }),
    prisma.payment.count({ where: { status: { in: ['PENDING', 'PARTIALLY_PAID'] } } })
  ])

  return {
    totals: {
      ...totals,
      margin: totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 100) : 0
    },
    overdueInvoices,
    pendingPayments,
    projects: rows
      .slice()
      .sort((a, b) => a.margin - b.margin)
      .map(row => ({
        id: row.project.id,
        code: row.project.code,
        name: row.project.name,
        currency: row.project.currency,
        revenue: row.revenue,
        actualCost: row.actualCost,
        profit: row.profit,
        margin: row.margin
      }))
  }
}

export function listExpenses(where: Prisma.ExpenseWhereInput, skip: number, take: number) {
  return Promise.all([
    prisma.expense.findMany({
      where, skip, take,
      orderBy: { date: 'desc' },
      include: {
        project: { select: { id: true, code: true } },
        createdBy: { select: { firstName: true, lastName: true } }
      }
    }),
    prisma.expense.count({ where })
  ])
}

export function listPayments(where: Prisma.PaymentWhereInput, skip: number, take: number) {
  return Promise.all([
    prisma.payment.findMany({
      where, skip, take,
      orderBy: { dueDate: 'desc' },
      include: {
        client: { select: { id: true, name: true } },
        project: { select: { id: true, code: true } },
        invoice: { select: { id: true, number: true } }
      }
    }),
    prisma.payment.count({ where })
  ])
}

export async function listInvoices(where: Prisma.InvoiceWhereInput, skip: number, take: number) {
  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where, skip, take,
      orderBy: { issuedAt: 'desc' },
      include: {
        client: { select: { id: true, name: true } },
        project: { select: { id: true, code: true } },
        _count: { select: { payments: true } }
      }
    }),
    prisma.invoice.count({ where })
  ])

  // How much each invoice has actually collected travels with the row, so the
  // table can show cover without one request per line.
  const paid = await prisma.payment.groupBy({
    by: ['invoiceId'],
    where: { invoiceId: { in: items.map(invoice => invoice.id) }, status: 'PAID' },
    _sum: { amount: true }
  })
  const paidByInvoice = new Map(
    paid.map(row => [row.invoiceId, Number(row._sum.amount ?? 0)])
  )

  const rows = items.map(invoice => ({
    ...invoice,
    paidTotal: paidByInvoice.get(invoice.id) ?? 0
  }))
  return [rows, total] as const
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
