import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { idParamSchema, listQuerySchema, partialUpdate, uuidSchema } from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { buildMeta, sendItem, sendList, sendNoContent, toSkipTake } from '../../lib/http'
import { prisma } from '../../lib/prisma'
import { recordAudit } from '../../lib/activity'
import * as service from './finance.service'

const EXPENSE_CATEGORIES = [
  'EMPLOYEE', 'FREELANCER', 'RENDER', 'SOFTWARE',
  'HARDWARE', 'AUDIO', 'PRODUCTION', 'OTHER'
] as const
const PAYMENT_STATUS = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const

const financeListSchema = listQuerySchema.extend({
  projectId: uuidSchema.optional(),
  clientId: uuidSchema.optional(),
  status: z.enum(PAYMENT_STATUS).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional()
})

const createExpenseSchema = z.object({
  projectId: uuidSchema,
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().max(500).optional().nullable(),
  amount: z.coerce.number().min(0).max(100000000),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  date: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')
})
const updateExpenseSchema = partialUpdate(createExpenseSchema)

const moneyAmount = z.coerce.number().min(0).max(100000000)
const currencyCode = z.string().trim().length(3).toUpperCase().default('USD')
const optionalDate = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')
  .optional()
  .nullable()

const createPaymentSchema = z.object({
  clientId: uuidSchema,
  projectId: uuidSchema.optional().nullable(),
  invoiceId: uuidSchema.optional().nullable(),
  amount: moneyAmount,
  currency: currencyCode,
  status: z.enum(PAYMENT_STATUS).default('PENDING'),
  dueDate: optionalDate,
  paidDate: optionalDate,
  method: z.string().trim().max(60).optional().nullable()
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
  issuedAt: optionalDate,
  dueDate: optionalDate
})
const updateInvoiceSchema = partialUpdate(createInvoiceSchema)

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

financeRouter.get(
  '/overview',
  requirePermission(PERMISSION.FINANCE_VIEW),
  async (_req, res, next) => {
    try {
      return sendItem(res, await service.overview())
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
      const query = validatedQuery<z.infer<typeof financeListSchema>>(req)
      const { skip, take } = toSkipTake(query.page, query.limit)
      const where: Prisma.ExpenseWhereInput = {}
      if (query.projectId) where.projectId = query.projectId
      if (query.category) where.category = query.category
      const [items, total] = await service.listExpenses(where, skip, take)
      return sendList(res, items, buildMeta(total, query.page, query.limit))
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
      const expense = await prisma.expense.create({
        data: { ...req.body, date: new Date(req.body.date), createdById: req.user?.id ?? null }
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
      const query = validatedQuery<z.infer<typeof financeListSchema>>(req)
      const { skip, take } = toSkipTake(query.page, query.limit)
      const where: Prisma.PaymentWhereInput = {}
      if (query.projectId) where.projectId = query.projectId
      if (query.clientId) where.clientId = query.clientId
      if (query.status) where.status = query.status
      const [items, total] = await service.listPayments(where, skip, take)
      return sendList(res, items, buildMeta(total, query.page, query.limit))
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
      const query = validatedQuery<z.infer<typeof financeListSchema>>(req)
      const { skip, take } = toSkipTake(query.page, query.limit)
      const where: Prisma.InvoiceWhereInput = {}
      if (query.projectId) where.projectId = query.projectId
      if (query.clientId) where.clientId = query.clientId
      if (query.status) where.status = query.status
      const [items, total] = await service.listInvoices(where, skip, take)
      return sendList(res, items, buildMeta(total, query.page, query.limit))
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
      const budgets = await prisma.projectBudget.findMany({
        include: { project: { select: { id: true, code: true, name: true, status: true } } },
        orderBy: { createdAt: 'desc' }
      })
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
      const expense = await prisma.expense.update({
        where: { id },
        data: { ...req.body, ...datePatch(req.body, ['date']) }
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
      const payment = await prisma.payment.create({
        data: { ...req.body, ...datePatch(req.body, ['dueDate', 'paidDate']) }
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
      const payment = await prisma.payment.update({
        where: { id },
        data: { ...req.body, ...datePatch(req.body, ['dueDate', 'paidDate']) }
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
