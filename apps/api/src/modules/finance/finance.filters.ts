import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { listQuerySchema, uuidSchema } from '@astir/validation'

/**
 * Filters shared by the finance lists, and how each list reads them.
 *
 * Every list answers the same questions — which period, which project or
 * client, which currency — but each record keeps its date in a different
 * column, so the vocabulary is shared and the translation is per model.
 */

export const EXPENSE_CATEGORIES = [
  'EMPLOYEE', 'FREELANCER', 'RENDER', 'SOFTWARE', 'HARDWARE',
  'AUDIO', 'PRODUCTION', 'OFFICE', 'TAXES', 'MARKETING', 'OTHER'
] as const
export const PAYMENT_STATUS = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const
export const PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'] as const

/** Invoices that are still owed something. */
export const OPEN_INVOICE: Prisma.InvoiceWhereInput = { status: { notIn: ['PAID', 'CANCELLED'] } }

/** A calendar day as YYYY-MM-DD; the period is always whole days. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')

export const currencyFilter = z.string().trim().length(3).toUpperCase()

export const financeListSchema = listQuerySchema.extend({
  /** A project id, or `none` for studio overhead with no project. */
  projectId: z.union([uuidSchema, z.literal('none')]).optional(),
  clientId: uuidSchema.optional(),
  status: z.enum(PAYMENT_STATUS).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  currency: currencyFilter.optional(),
  from: day.optional(),
  to: day.optional(),
  /** Unpaid past their due date, whatever status somebody last typed. */
  overdue: z.enum(['true', 'false']).optional(),
  format: z.enum(['json', 'csv']).default('json')
})

export type FinanceListQuery = z.infer<typeof financeListSchema>

export interface DateRange {
  gte?: Date
  lte?: Date
}

/** Start of a day in UTC: date columns are stored as UTC midnights. */
export function dayStart(value: string): Date {
  return new Date(value + 'T00:00:00.000Z')
}

/** The very end of a day, so `to` includes everything that happened on it. */
export function dayEnd(value: string): Date {
  return new Date(value + 'T23:59:59.999Z')
}

export function rangeOf(query: { from?: string, to?: string }): DateRange | undefined {
  if (!query.from && !query.to) return undefined
  return {
    ...(query.from ? { gte: dayStart(query.from) } : {}),
    ...(query.to ? { lte: dayEnd(query.to) } : {})
  }
}

/** Past due and still open, or marked overdue by hand. */
export function overdueInvoiceWhere(now: Date): Prisma.InvoiceWhereInput {
  return { ...OPEN_INVOICE, OR: [{ dueDate: { lt: now } }, { status: 'OVERDUE' }] }
}

export function expenseWhere(query: FinanceListQuery): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = {}
  if (query.projectId === 'none') where.projectId = null
  else if (query.projectId) where.projectId = query.projectId
  if (query.clientId) where.project = { clientId: query.clientId }
  if (query.category) where.category = query.category
  if (query.method) where.paymentMethod = query.method
  if (query.currency) where.currency = query.currency
  const range = rangeOf(query)
  if (range) where.date = range
  if (query.search) {
    where.OR = [
      { description: { contains: query.search, mode: 'insensitive' } },
      { vendor: { contains: query.search, mode: 'insensitive' } },
      { documentNumber: { contains: query.search, mode: 'insensitive' } }
    ]
  }
  return where
}

/**
 * A payment belongs to the day it was paid; one not paid yet, to its due date.
 * Filtering by either column alone would drop half of the ledger.
 */
export function paymentWhere(query: FinanceListQuery, now = new Date()): Prisma.PaymentWhereInput {
  const and: Prisma.PaymentWhereInput[] = []
  if (query.projectId === 'none') and.push({ projectId: null })
  else if (query.projectId) and.push({ projectId: query.projectId })
  if (query.clientId) and.push({ clientId: query.clientId })
  if (query.status) and.push({ status: query.status })
  if (query.method) and.push({ method: query.method })
  if (query.currency) and.push({ currency: query.currency })
  const range = rangeOf(query)
  if (range) {
    and.push({ OR: [{ paidDate: range }, { paidDate: null, dueDate: range }] })
  }
  if (query.overdue === 'true') {
    and.push({ status: { notIn: ['PAID', 'CANCELLED'] } })
    and.push({ OR: [{ dueDate: { lt: now } }, { status: 'OVERDUE' }] })
  }
  if (query.search) {
    and.push({
      OR: [
        { reference: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
        { invoice: { number: { contains: query.search, mode: 'insensitive' } } }
      ]
    })
  }
  return and.length > 0 ? { AND: and } : {}
}

export function invoiceWhere(query: FinanceListQuery, now = new Date()): Prisma.InvoiceWhereInput {
  const and: Prisma.InvoiceWhereInput[] = []
  if (query.projectId === 'none') and.push({ projectId: null })
  else if (query.projectId) and.push({ projectId: query.projectId })
  if (query.clientId) and.push({ clientId: query.clientId })
  if (query.status) and.push({ status: query.status })
  if (query.currency) and.push({ currency: query.currency })
  const range = rangeOf(query)
  if (range) and.push({ issuedAt: range })
  if (query.overdue === 'true') and.push(overdueInvoiceWhere(now))
  if (query.search) {
    and.push({
      OR: [
        { number: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } }
      ]
    })
  }
  return and.length > 0 ? { AND: and } : {}
}

/** Rows a CSV export reads at most; a studio ledger stays well under this. */
export const EXPORT_LIMIT = 5000
