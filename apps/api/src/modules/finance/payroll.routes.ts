import { Router } from 'express'
import { z } from 'zod'
import { idParamSchema, listQuerySchema, partialUpdate, uuidSchema } from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { buildMeta, sendItem, sendList, sendNoContent, toSkipTake } from '../../lib/http'
import { prisma } from '../../lib/prisma'
import { recordAudit } from '../../lib/activity'
import { t } from '../../i18n'
import * as service from './payroll.service'
import { payrollDays } from './payroll.days'
import * as payouts from './payroll.payouts'

/**
 * /api/finance/payroll — advances, penalties, bonuses and deductions on
 * employees' monthly pay (client item 7). Mounted inside the finance router,
 * which has already authenticated the request.
 *
 * Every write lands in the audit log, never the activity feed: the feed is
 * read by most of the studio, and one person's fine is not its business.
 */

const ENTRY_TYPES = ['ADVANCE', 'BONUS', 'PENALTY', 'LATENESS', 'DEDUCTION', 'OTHER_ACCRUAL'] as const
const ENTRY_STATUSES = ['DRAFT', 'APPROVED', 'PAID', 'CANCELLED'] as const
const ENTRY_SOURCES = ['MANUAL', 'TIMESHEET', 'EXTERNAL'] as const

const periodSchema = z.string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: () => t('common.validation.monthFormat') })
const dateSchema = z.string()
  .refine(value => !Number.isNaN(Date.parse(value)), { error: () => t('common.validation.invalidDate') })
const currencyCode = z.string().trim().length(3).toUpperCase()

const listSchema = listQuerySchema.extend({
  employeeId: uuidSchema.optional(),
  type: z.enum(ENTRY_TYPES).optional(),
  status: z.enum(ENTRY_STATUSES).optional(),
  source: z.enum(ENTRY_SOURCES).optional(),
  period: periodSchema.optional()
})

const summarySchema = z.object({
  period: periodSchema.optional(),
  employeeId: uuidSchema.optional()
})

const createSchema = z.object({
  employeeId: uuidSchema,
  type: z.enum(ENTRY_TYPES),
  // Positive always: the type carries the sign.
  amount: z.coerce.number().positive().max(10_000_000_000),
  currency: currencyCode.optional(),
  date: dateSchema,
  // Left out, the period is the month of `date`.
  period: periodSchema.optional(),
  lateMinutes: z.coerce.number().int().min(1).max(24 * 60).optional().nullable(),
  reason: z.string().trim().max(1000).optional().nullable(),
  // For integrations; the page never sends these and gets MANUAL.
  source: z.enum(ENTRY_SOURCES).optional(),
  externalId: z.string().trim().min(1).max(200).optional().nullable()
})

const updateSchema = partialUpdate(createSchema.omit({ source: true, externalId: true }))

const statusSchema = z.object({ status: z.enum(ENTRY_STATUSES) })

const salaryParamSchema = z.object({ employeeId: uuidSchema })
const salarySchema = z.object({
  // null removes the salary on file.
  amount: z.coerce.number().min(0).max(10_000_000_000).nullable(),
  currency: currencyCode.optional()
})

/** The current month in the studio's zone is close enough: UTC month. */
const currentPeriod = () => new Date().toISOString().slice(0, 7)

export const payrollRouter = Router()

payrollRouter.get(
  '/',
  requirePermission(PERMISSION.PAYROLL_VIEW_OWN),
  validate(listSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<z.infer<typeof listSchema>>(req)
      const scope = await service.scopeFor(req.user)
      const { skip, take } = toSkipTake(query.page, query.limit)
      const [items, total] = await service.list(service.listWhere(query, scope), skip, take)
      return sendList(res, items, buildMeta(total, query.page, query.limit))
    } catch (err) {
      next(err)
    }
  }
)

/**
 * The caller's own month whatever their rights: norm hours, hours worked,
 * pay earned so far. Someone who sees everyone's payroll still gets only
 * their own row here — it feeds the «Мой месяц» card.
 */
payrollRouter.get(
  '/me',
  requirePermission(PERMISSION.PAYROLL_VIEW_OWN),
  validate(summarySchema.pick({ period: true }), 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<{ period?: string }>(req)
      const own = await prisma.employee.findFirst({
        where: { userId: req.user!.id, deletedAt: null },
        select: { id: true }
      })
      if (!own) return sendItem(res, { tracked: false })
      const month = await service.summary(query.period ?? currentPeriod(), { ownEmployeeId: own.id })
      return sendItem(res, { tracked: true, period: month.period, month: month.month, rows: month.rows })
    } catch (err) {
      next(err)
    }
  }
)

payrollRouter.get(
  '/summary',
  requirePermission(PERMISSION.PAYROLL_VIEW_OWN),
  validate(summarySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<z.infer<typeof summarySchema>>(req)
      const scope = await service.scopeFor(req.user)
      return sendItem(res, await service.summary(query.period ?? currentPeriod(), scope, query.employeeId))
    } catch (err) {
      next(err)
    }
  }
)

/**
 * One employee's month day by day («По дням»). Someone with only the
 * own-payroll right always gets their own month, whatever employeeId says;
 * payroll:view picks anyone, and by default themselves.
 */
payrollRouter.get(
  '/days',
  requirePermission(PERMISSION.PAYROLL_VIEW_OWN),
  validate(summarySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<z.infer<typeof summarySchema>>(req)
      const scope = await service.scopeFor(req.user)
      let employeeId = scope.ownEmployeeId ?? query.employeeId
      if (!employeeId) {
        const own = await prisma.employee.findFirst({
          where: { userId: req.user!.id, deletedAt: null },
          select: { id: true }
        })
        employeeId = own?.id
      }
      if (!employeeId || employeeId === service.NO_EMPLOYEE) return sendItem(res, { tracked: false })
      const month = await payrollDays(query.period ?? currentPeriod(), employeeId)
      return sendItem(res, { tracked: true, ...month })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * People an entry can be written for.
 *
 * The finance role does not hold team:view, so the form cannot borrow the
 * employees endpoint; this answers just enough to fill a select, plus the
 * salary on file, which only payroll may see.
 */
payrollRouter.get(
  '/employees',
  requirePermission(PERMISSION.PAYROLL_VIEW),
  async (_req, res, next) => {
    try {
      const employees = await prisma.employee.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          position: true,
          status: true,
          user: { select: { firstName: true, lastName: true } },
          salary: { select: { amount: true, currency: true } }
        },
        orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }]
      })
      const items = employees.map(employee => ({
        id: employee.id,
        name: employee.user.firstName + ' ' + employee.user.lastName,
        position: employee.position,
        status: employee.status,
        salary: employee.salary
      }))
      return sendList(res, items, { page: 1, limit: items.length, total: items.length, pages: 1 })
    } catch (err) {
      next(err)
    }
  }
)

payrollRouter.put(
  '/salaries/:employeeId',
  requirePermission(PERMISSION.PAYROLL_MANAGE),
  validate(salaryParamSchema, 'params'),
  validate(salarySchema),
  async (req, res, next) => {
    try {
      const employeeId = req.params.employeeId as string
      const salary = await service.setSalary(employeeId, req.body.amount, req.body.currency, req.user?.id)
      await recordAudit({
        actorId: req.user?.id,
        action: salary ? 'finance.salary_set' : 'finance.salary_cleared',
        entityType: 'Employee',
        entityId: employeeId,
        ipAddress: req.ip,
        metadata: salary ? { amount: String(salary.amount), currency: salary.currency } : {}
      })
      return sendItem(res, salary)
    } catch (err) {
      next(err)
    }
  }
)

/** Several salaries at once, from the «Оклады» editing mode of the table. */
const salariesBulkSchema = z.object({
  items: z.array(salarySchema.extend({ employeeId: uuidSchema })).min(1).max(500)
})

payrollRouter.put(
  '/salaries',
  requirePermission(PERMISSION.PAYROLL_MANAGE),
  validate(salariesBulkSchema),
  async (req, res, next) => {
    try {
      const items = (req.body as z.infer<typeof salariesBulkSchema>).items
      const saved = await service.setSalaries(items, req.user?.id)
      for (const item of saved) {
        await recordAudit({
          actorId: req.user?.id,
          action: item.salary ? 'finance.salary_set' : 'finance.salary_cleared',
          entityType: 'Employee',
          entityId: item.employeeId,
          ipAddress: req.ip,
          metadata: item.salary ? { amount: String(item.salary.amount), currency: item.salary.currency } : {}
        })
      }
      return sendItem(res, { saved: saved.length })
    } catch (err) {
      next(err)
    }
  }
)

const payoutSchema = z.object({
  period: periodSchema,
  employeeId: uuidSchema,
  currency: currencyCode,
  note: z.string().trim().max(1000).optional().nullable()
})

payrollRouter.get(
  '/payouts',
  requirePermission(PERMISSION.PAYROLL_VIEW_OWN),
  validate(summarySchema.pick({ period: true }), 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<{ period?: string }>(req)
      const scope = await service.scopeFor(req.user)
      const items = await payouts.listPayouts(query.period ?? currentPeriod(), scope)
      return sendList(res, items, { page: 1, limit: items.length, total: items.length, pages: 1 })
    } catch (err) {
      next(err)
    }
  }
)

payrollRouter.post(
  '/payouts',
  requirePermission(PERMISSION.PAYROLL_MANAGE),
  validate(payoutSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof payoutSchema>
      const payout = await payouts.payOut(body.period, body.employeeId, body.currency, req.user?.id, body.note)
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.payroll_paid_out',
        entityType: 'Employee',
        entityId: payout.employeeId,
        ipAddress: req.ip,
        metadata: { period: payout.period, amount: String(payout.amount), currency: payout.currency }
      })
      return sendItem(res, payout, 201)
    } catch (err) {
      next(err)
    }
  }
)

payrollRouter.post(
  '/payouts/all',
  requirePermission(PERMISSION.PAYROLL_MANAGE),
  validate(payoutSchema.pick({ period: true })),
  async (req, res, next) => {
    try {
      const result = await payouts.payAll((req.body as { period: string }).period, req.user?.id)
      for (const payout of result.paid) {
        await recordAudit({
          actorId: req.user?.id,
          action: 'finance.payroll_paid_out',
          entityType: 'Employee',
          entityId: payout.employeeId,
          ipAddress: req.ip,
          metadata: { period: payout.period, amount: String(payout.amount), currency: payout.currency }
        })
      }
      return sendItem(res, { paid: result.paid.length, skipped: result.skipped })
    } catch (err) {
      next(err)
    }
  }
)

payrollRouter.delete(
  '/payouts/:id',
  requirePermission(PERMISSION.PAYROLL_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const removed = await payouts.undoPayout(req.params.id as string)
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.payroll_payout_undone',
        entityType: 'Employee',
        entityId: removed.employeeId,
        ipAddress: req.ip,
        metadata: { period: removed.period, amount: String(removed.amount), currency: removed.currency }
      })
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

payrollRouter.get(
  '/:id',
  requirePermission(PERMISSION.PAYROLL_VIEW_OWN),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const scope = await service.scopeFor(req.user)
      const entry = await service.getById(req.params.id as string)
      const hidden = scope.ownEmployeeId &&
        (entry.employeeId !== scope.ownEmployeeId || entry.status === 'DRAFT')
      // Somebody else's entry answers like a missing one, not like a secret.
      if (hidden) return next(service.notFoundEntry())
      return sendItem(res, entry)
    } catch (err) {
      next(err)
    }
  }
)

payrollRouter.post(
  '/',
  requirePermission(PERMISSION.PAYROLL_MANAGE),
  validate(createSchema),
  async (req, res, next) => {
    try {
      const entry = await service.create(req.body, req.user?.id)
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.payroll_created',
        entityType: 'PayrollEntry',
        entityId: entry.id,
        ipAddress: req.ip,
        metadata: {
          employeeId: entry.employeeId,
          type: entry.type,
          amount: String(entry.amount),
          currency: entry.currency,
          period: entry.period,
          source: entry.source
        }
      })
      return sendItem(res, entry, 201)
    } catch (err) {
      next(err)
    }
  }
)

payrollRouter.patch(
  '/:id',
  requirePermission(PERMISSION.PAYROLL_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const entry = await service.update(id, req.body)
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.payroll_updated',
        entityType: 'PayrollEntry',
        entityId: id,
        ipAddress: req.ip,
        metadata: { type: entry.type, amount: String(entry.amount), period: entry.period }
      })
      return sendItem(res, entry)
    } catch (err) {
      next(err)
    }
  }
)

payrollRouter.post(
  '/:id/status',
  requirePermission(PERMISSION.PAYROLL_MANAGE),
  validate(idParamSchema, 'params'),
  validate(statusSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const { entry, from } = await service.setStatus(id, req.body.status, req.user?.id)
      if (from !== entry.status) {
        await recordAudit({
          actorId: req.user?.id,
          action: 'finance.payroll_status',
          entityType: 'PayrollEntry',
          entityId: id,
          ipAddress: req.ip,
          metadata: { from, to: entry.status, amount: String(entry.amount) }
        })
      }
      return sendItem(res, entry)
    } catch (err) {
      next(err)
    }
  }
)

payrollRouter.delete(
  '/:id',
  requirePermission(PERMISSION.PAYROLL_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const removed = await service.remove(id)
      await recordAudit({
        actorId: req.user?.id,
        action: 'finance.payroll_deleted',
        entityType: 'PayrollEntry',
        entityId: id,
        ipAddress: req.ip,
        metadata: {
          employeeId: removed.employeeId,
          type: removed.type,
          amount: String(removed.amount),
          status: removed.status
        }
      })
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)
