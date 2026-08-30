import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { idParamSchema, listQuerySchema, uuidSchema } from '@astir/validation'
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
