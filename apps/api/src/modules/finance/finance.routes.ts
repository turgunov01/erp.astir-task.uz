import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { idParamSchema, partialUpdate, uuidSchema } from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import {
  buildMeta, sendItem, sendList, sendListWithSummary, sendNoContent, toSkipTake
} from '../../lib/http'
import { sendCsv } from '../../lib/csv'
import {
  EXPENSE_CATEGORY_RU, PAYMENT_METHOD_RU, PAYMENT_STATUS_RU, labelRu
} from '../../lib/labels-ru'
import { badRequest } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { recordAudit } from '../../lib/activity'
import * as service from './finance.service'
import { financeOverview } from './finance.overview'
import {
  EXPENSE_CATEGORIES, EXPORT_LIMIT, PAYMENT_METHODS, PAYMENT_STATUS,
  expenseWhere, financeListSchema, invoiceWhere, paymentWhere,
  type FinanceListQuery
} from './finance.filters'
import { payrollRouter } from './payroll.routes'

const moneyAmount = z.coerce.number().min(0).max(100000000)
const currencyCode = z.string().trim().length(3).toUpperCase().default('USD')
const optionalDate = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)), 'Неверная дата')
  .optional()
  .nullable()
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable()
/** Only web links: a `javascript:` URL in a table cell is an attack, not a scan. */
const documentLink = z
  .string()
  .trim()
  .max(1000)
  .refine(value => value === '' || /^https?:\/\/\S+$/i.test(value), 'Ссылка должна начинаться с http:// или https://')
  .optional()
  .nullable()

const createExpenseSchema = z.object({
  // Empty for studio overhead — rent, taxes, subscriptions.
  projectId: uuidSchema.optional().nullable(),
  category: z.enum(EXPENSE_CATEGORIES),
  description: optionalText(500),
  amount: moneyAmount,
  currency: currencyCode,
  date: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'Неверная дата'),
  vendor: optionalText(200),
  paymentMethod: z.enum(PAYMENT_METHODS).optional().nullable(),
  documentNumber: optionalText(80),
  documentUrl: documentLink,
  vatAmount: moneyAmount.optional().nullable()
})
const updateExpenseSchema = partialUpdate(createExpenseSchema)

const createPaymentSchema = z.object({
  clientId: uuidSchema,
  projectId: uuidSchema.optional().nullable(),
  invoiceId: uuidSchema.optional().nullable(),
  amount: moneyAmount,
  currency: currencyCode,
  status: z.enum(PAYMENT_STATUS).default('PENDING'),
  dueDate: optionalDate,
  paidDate: optionalDate,
  method: z.enum(PAYMENT_METHODS).optional().nullable(),
  reference: optionalText(120),
  fee: moneyAmount.optional().nullable(),
  notes: optionalText(1000)
})
const updatePaymentSchema = partialUpdate(createPaymentSchema)

const createInvoiceSchema = z.object({
  // Left blank the service derives the next INV-nnnn number.
  number: z.string().trim().min(1).max(40).optional(),
  clientId: uuidSchema,
  projectId: uuidSchema.optional().nullable(),
  amount: moneyAmount,
  currency: currencyCode,
  status: z.enum(PAYMENT_STATUS).default('PENDING'),
  // Left out, the invoice is issued today. Never null: the column is NOT NULL.
  issuedAt: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date').optional(),
  dueDate: optionalDate,
  description: optionalText(1000),
  vatAmount: moneyAmount.optional().nullable()
})
const updateInvoiceSchema = partialUpdate(createInvoiceSchema)

const overviewQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
})

const budgetLinesSchema = z.object({
  lines: z.array(z.object({
    category: z.enum(EXPENSE_CATEGORIES),
    plannedAmount: moneyAmount
  })).max(EXPENSE_CATEGORIES.length)
}).refine(
  body => new Set(body.lines.map(line => line.category)).size === body.lines.length,
  'Каждая категория указывается один раз'
)

/** A fee on a payment cannot be more than the payment itself. */
function checkFee(body: { amount?: number, fee?: number | null }) {
  if (body.fee != null && body.amount != null && body.fee > body.amount) {
    throw badRequest('Комиссия не может быть больше суммы платежа')
  }
}

/** VAT is part of the amount, so it cannot exceed it. */
function checkVat(body: { amount?: number, vatAmount?: number | null }) {
  if (body.vatAmount != null && body.amount != null && body.vatAmount > body.amount) {
    throw badRequest('НДС не может быть больше суммы')
  }
}

/** Calendar month of today, as the dashboard's default period. */
function currentMonth(): { from: string, to: string } {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const prefix = year + '-' + String(month + 1).padStart(2, '0')
  return { from: prefix + '-01', to: prefix + '-' + String(last).padStart(2, '0') }
}

const methodLabel = PAYMENT_METHOD_RU
const statusLabel = PAYMENT_STATUS_RU
const categoryLabel = EXPENSE_CATEGORY_RU
const label = labelRu

/** An emptied link field is cleared, not stored as an empty string. */
function expenseData<T extends Record<string, unknown>>(body: T): T {
  return 'documentUrl' in body && !body.documentUrl ? { ...body, documentUrl: null } : body
}

/** A cleared fee means no fee: the column is a number, never null. */
function paymentData<T extends Record<string, unknown>>(body: T): T {
  return 'fee' in body && body.fee == null ? { ...body, fee: 0 } : body
}

/** The stored amount, for checks on a PATCH that does not resend it. */
async function currentAmount(model: 'expense' | 'payment' | 'invoice', id: string) {
  const where = { where: { id }, select: { amount: true } }
  const row = model === 'expense'
    ? await prisma.expense.findUnique(where)
    : model === 'payment'
      ? await prisma.payment.findUnique(where)
      : await prisma.invoice.findUnique(where)
  return row ? Number(row.amount) : undefined
}

/** Page window for a list request; a CSV export reads every matching row. */
function windowOf(query: FinanceListQuery) {
  return query.format === 'csv'
    ? { skip: 0, take: EXPORT_LIMIT }
    : toSkipTake(query.page, query.limit)
}

/*
 * actualCost is deliberately absent: profitability() derives it from expenses
 * and priced hours, and a second, typed-in copy of that number would disagree
 * with the first one the moment anybody logged an expense.
 */
const createBudgetSchema = z.object({
  projectId: uuidSchema,
  revenue: moneyAmount.default(0),
  plannedCost: moneyAmount.default(0),
  currency: currencyCode
})
const updateBudgetSchema = partialUpdate(createBudgetSchema.omit({ projectId: true }))

/** Body dates arrive as ISO strings; Prisma wants Date, and null clears one. */
function toDate(value: unknown): Date | null {
  if (value === null || value === '') return null
  return new Date(String(value))
}

/** Only the date keys the body actually carried, converted for Prisma. */
function datePatch(body: Record<string, unknown>, keys: string[]) {
  const patch: Record<string, Date | null> = {}
  for (const key of keys) {
    if (key in body) patch[key] = toDate(body[key])
  }
  return patch
}


export const financeRouter = Router()

financeRouter.use(authenticate)

// Employee pay adjustments carry their own, narrower permissions.
financeRouter.use('/payroll', payrollRouter)

financeRouter.get(
  '/overview',
  requirePermission(PERMISSION.FINANCE_VIEW),
  validate(overviewQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<z.infer<typeof overviewQuerySchema>>(req)
      const fallback = currentMonth()
      const from = query.from ?? fallback.from
      const to = query.to ?? fallback.to
      if (from > to) throw badRequest('Начало периода позже его конца')
      return sendItem(res, await financeOverview({ from, to, user: req.user! }))
    } catch (err) {
      next(err)
    }
  }
)

/** Per-project profitability, computed rather than stored (spec 43). */
financeRouter.get(
  '/profitability/:id',
  requirePermission(PERMISSION.BUDGET_VIEW),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.profitability(req.params.id as string))
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.get(
  '/expenses',
  requirePermission(PERMISSION.FINANCE_VIEW),
  validate(financeListSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<FinanceListQuery>(req)
      const { skip, take } = windowOf(query)
      const [items, total, summary] = await service.listExpenses(expenseWhere(query), skip, take)

      if (query.format === 'csv') {
        return sendCsv(res, 'expenses', [
          { header: 'Дата', value: row => row.date },
          { header: 'Проект', value: row => row.project?.code ?? 'Студия (без проекта)' },
          { header: 'Клиент', value: row => row.project?.client?.name },
          { header: 'Категория', value: row => label(categoryLabel, row.category) },
          { header: 'Контрагент', value: row => row.vendor },
          { header: 'Описание', value: row => row.description },
          { header: 'Способ оплаты', value: row => label(methodLabel, row.paymentMethod) },
          { header: 'Документ №', value: row => row.documentNumber },
          { header: 'Ссылка на документ', value: row => row.documentUrl },
          { header: 'Сумма', value: row => Number(row.amount) },
          { header: 'В т.ч. НДС', value: row => (row.vatAmount === null ? null : Number(row.vatAmount)) },
          { header: 'Валюта', value: row => row.currency },
          { header: 'Внёс', value: row => (row.createdBy ? row.createdBy.firstName + ' ' + row.createdBy.lastName : '') }
        ], [...items])
      }
      return sendListWithSummary(res, items, buildMeta(total, query.page, query.limit), summary)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.post(
  '/expenses',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(createExpenseSchema),
  async (req, res, next) => {
    try {
      checkVat(req.body)
      const expense = await prisma.expense.create({
        data: {
          ...expenseData(req.body),
          date: new Date(req.body.date),
          createdById: req.user?.id ?? null
        }
      })
      // Money movements belong in the audit trail, not just the activity feed.
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.expense_created',
        entityType: 'Expense',
        entityId: expense.id,
        ipAddress: req.ip,
        metadata: { amount: String(expense.amount), category: expense.category }
      })
      return sendItem(res, expense, 201)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.delete(
  '/expenses/:id',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      await prisma.expense.delete({ where: { id } })
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.expense_deleted',
        entityType: 'Expense',
        entityId: id,
        ipAddress: req.ip
      })
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.get(
  '/payments',
  requirePermission(PERMISSION.FINANCE_VIEW),
  validate(financeListSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<FinanceListQuery>(req)
      const { skip, take } = windowOf(query)
      const [items, total, summary] = await service.listPayments(paymentWhere(query), skip, take)

      if (query.format === 'csv') {
        return sendCsv(res, 'payments', [
          { header: 'Дата оплаты', value: row => row.paidDate },
          { header: 'Срок', value: row => row.dueDate },
          { header: 'Клиент', value: row => row.client?.name },
          { header: 'Проект', value: row => row.project?.code },
          { header: 'Счёт', value: row => row.invoice?.number },
          { header: 'Статус', value: row => label(statusLabel, row.status) },
          { header: 'Способ', value: row => label(methodLabel, row.method) },
          { header: 'Номер транзакции', value: row => row.reference },
          { header: 'Сумма', value: row => Number(row.amount) },
          { header: 'Комиссия', value: row => Number(row.fee) },
          { header: 'Валюта', value: row => row.currency },
          { header: 'Примечание', value: row => row.notes }
        ], [...items])
      }
      return sendListWithSummary(res, items, buildMeta(total, query.page, query.limit), summary)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.get(
  '/invoices',
  requirePermission(PERMISSION.FINANCE_VIEW),
  validate(financeListSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<FinanceListQuery>(req)
      const { skip, take } = windowOf(query)
      const [items, total, summary] = await service.listInvoices(invoiceWhere(query), skip, take)

      if (query.format === 'csv') {
        return sendCsv(res, 'invoices', [
          { header: 'Номер', value: row => row.number },
          { header: 'Выставлен', value: row => row.issuedAt },
          { header: 'Оплатить до', value: row => row.dueDate },
          { header: 'Клиент', value: row => row.client?.name },
          { header: 'Проект', value: row => row.project?.code },
          { header: 'Назначение', value: row => row.description },
          { header: 'Статус', value: row => label(statusLabel, row.status) },
          { header: 'Просрочен, дней', value: row => (row.overdue ? row.daysLate : null) },
          { header: 'Сумма', value: row => Number(row.amount) },
          { header: 'В т.ч. НДС', value: row => (row.vatAmount === null ? null : Number(row.vatAmount)) },
          { header: 'Оплачено', value: row => row.paidTotal },
          { header: 'Остаток', value: row => row.remaining },
          { header: 'Валюта', value: row => row.currency }
        ], [...items])
      }
      return sendListWithSummary(res, items, buildMeta(total, query.page, query.limit), summary)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.get(
  '/budgets',
  requirePermission(PERMISSION.BUDGET_VIEW),
  async (_req, res, next) => {
    try {
      const budgets = await service.listBudgets()
      return sendList(res, budgets, {
        page: 1, limit: budgets.length, total: budgets.length, pages: 1
      })
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.patch(
  '/expenses/:id',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateExpenseSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      checkVat({ ...req.body, amount: req.body.amount ?? (await currentAmount('expense', id)) })
      const expense = await prisma.expense.update({
        where: { id },
        data: { ...expenseData(req.body), ...datePatch(req.body, ['date']) }
      })
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.expense_updated',
        entityType: 'Expense',
        entityId: id,
        ipAddress: req.ip,
        metadata: { amount: String(expense.amount), category: expense.category }
      })
      return sendItem(res, expense)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.post(
  '/payments',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(createPaymentSchema),
  async (req, res, next) => {
    try {
      checkFee(req.body)
      const payment = await prisma.payment.create({
        data: { ...paymentData(req.body), ...datePatch(req.body, ['dueDate', 'paidDate']) }
      })
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.payment_created',
        entityType: 'Payment',
        entityId: payment.id,
        ipAddress: req.ip,
        metadata: { amount: String(payment.amount), status: payment.status }
      })
      return sendItem(res, payment, 201)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.patch(
  '/payments/:id',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updatePaymentSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      checkFee({ ...req.body, amount: req.body.amount ?? (await currentAmount('payment', id)) })
      const payment = await prisma.payment.update({
        where: { id },
        data: { ...paymentData(req.body), ...datePatch(req.body, ['dueDate', 'paidDate']) }
      })
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.payment_updated',
        entityType: 'Payment',
        entityId: id,
        ipAddress: req.ip,
        metadata: { amount: String(payment.amount), status: payment.status }
      })
      return sendItem(res, payment)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.delete(
  '/payments/:id',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      await prisma.payment.delete({ where: { id } })
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.payment_deleted',
        entityType: 'Payment',
        entityId: id,
        ipAddress: req.ip
      })
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * How much of one invoice its payments cover.
 *
 * Recording a payment never closes an invoice by itself: the interface reads
 * this, asks, and only then writes the status the user agreed to (spec 43).
 */
financeRouter.get(
  '/invoices/:id/coverage',
  requirePermission(PERMISSION.FINANCE_VIEW),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      return sendItem(res, await service.invoiceCoverage(req.params.id as string))
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.post(
  '/invoices',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(createInvoiceSchema),
  async (req, res, next) => {
    try {
      checkVat(req.body)
      const invoice = await prisma.invoice.create({
        data: {
          ...req.body,
          number: req.body.number ?? (await service.nextInvoiceNumber()),
          ...datePatch(req.body, ['issuedAt', 'dueDate'])
        }
      })
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.invoice_created',
        entityType: 'Invoice',
        entityId: invoice.id,
        ipAddress: req.ip,
        metadata: { number: invoice.number, amount: String(invoice.amount) }
      })
      return sendItem(res, invoice, 201)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.patch(
  '/invoices/:id',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateInvoiceSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      checkVat({ ...req.body, amount: req.body.amount ?? (await currentAmount('invoice', id)) })
      const invoice = await prisma.invoice.update({
        where: { id },
        data: { ...req.body, ...datePatch(req.body, ['issuedAt', 'dueDate']) }
      })
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.invoice_updated',
        entityType: 'Invoice',
        entityId: id,
        ipAddress: req.ip,
        metadata: { number: invoice.number, status: invoice.status }
      })
      return sendItem(res, invoice)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.delete(
  '/invoices/:id',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      await prisma.invoice.delete({ where: { id } })
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.invoice_deleted',
        entityType: 'Invoice',
        entityId: id,
        ipAddress: req.ip
      })
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * One budget per project: the column is unique, so a second save is an edit
 * rather than a duplicate somebody then has to reconcile.
 */
financeRouter.post(
  '/budgets',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(createBudgetSchema),
  async (req, res, next) => {
    try {
      const { projectId, revenue, plannedCost, currency } = req.body
      const budget = await prisma.projectBudget.upsert({
        where: { projectId },
        create: { projectId, revenue, plannedCost, currency },
        update: { revenue, plannedCost, currency },
        include: { project: { select: { id: true, code: true, name: true, status: true } } }
      })
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.budget_saved',
        entityType: 'ProjectBudget',
        entityId: budget.id,
        ipAddress: req.ip,
        metadata: { revenue: String(budget.revenue), plannedCost: String(budget.plannedCost) }
      })
      return sendItem(res, budget, 201)
    } catch (err) {
      next(err)
    }
  }
)

/** The planned cost split by expense category; the fact comes from expenses. */
financeRouter.put(
  '/budgets/:id/lines',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(idParamSchema, 'params'),
  validate(budgetLinesSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const lines = (req.body as z.infer<typeof budgetLinesSchema>).lines
      const budget = await service.replaceBudgetLines(id, lines)
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.budget_lines_saved',
        entityType: 'ProjectBudget',
        entityId: id,
        ipAddress: req.ip,
        metadata: {
          lines: budget.lines.map(line => line.category + ':' + String(line.plannedAmount)).join(', ')
        }
      })
      return sendItem(res, budget)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.patch(
  '/budgets/:id',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateBudgetSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const budget = await prisma.projectBudget.update({
        where: { id },
        data: req.body,
        include: { project: { select: { id: true, code: true, name: true, status: true } } }
      })
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.budget_saved',
        entityType: 'ProjectBudget',
        entityId: id,
        ipAddress: req.ip,
        metadata: { revenue: String(budget.revenue), plannedCost: String(budget.plannedCost) }
      })
      return sendItem(res, budget)
    } catch (err) {
      next(err)
    }
  }
)

financeRouter.delete(
  '/budgets/:id',
  requirePermission(PERMISSION.FINANCE_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      await prisma.projectBudget.delete({ where: { id } })
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.budget_deleted',
        entityType: 'ProjectBudget',
        entityId: id,
        ipAddress: req.ip
      })
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)
