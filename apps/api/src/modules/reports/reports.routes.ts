import { Router } from 'express'
import { z } from 'zod'
import { uuidSchema } from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem } from '../../lib/http'
import { sendCsv } from '../../lib/csv'
import {
  enumLabel
} from '../../lib/labels'
import { t } from '../../i18n'
import * as service from './reports.service'

export const reportsRouter = Router()

reportsRouter.use(authenticate)

const isoDate = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)), 'Неверная дата')
  .optional()

const reportQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  projectId: uuidSchema.optional(),
  format: z.enum(['json', 'csv']).default('json'),
  /** Which table of the financial report to export; ignored by the others. */
  section: z.enum(['months', 'categories', 'ageing']).default('months')
})

type ReportQuery = z.infer<typeof reportQuerySchema>

function toPeriod(query: ReportQuery): service.Period {
  return {
    from: query.from ? new Date(query.from) : null,
    // A bare end date means the whole of that day, not its midnight.
    to: query.to ? new Date(new Date(query.to).setHours(23, 59, 59, 999)) : null
  }
}

/* ------------------------------------------------------------- production */

reportsRouter.get(
  '/production',
  requirePermission(PERMISSION.REPORT_VIEW),
  validate(reportQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<ReportQuery>(req)
      const rows = await service.production(query.projectId)

      if (query.format === 'csv') {
        return sendCsv(res, 'production', [
          { header: t('finance.csv.code'), value: row => row.code },
          { header: t('finance.csv.project'), value: row => row.name },
          { header: t('finance.csv.status'), value: row => enumLabel('projectStatus', row.status) },
          { header: t('finance.csv.risk'), value: row => enumLabel('risk', row.risk) },
          { header: t('finance.csv.progress'), value: row => row.progress },
          { header: t('finance.csv.deadline'), value: row => row.deadline },
          { header: t('finance.csv.late'), value: row => (row.late ? t('common.yes') : t('common.no')) },
          { header: t('finance.csv.stagesTotal'), value: row => row.stagesTotal },
          { header: t('finance.csv.stagesDone'), value: row => row.stagesDone },
          { header: t('finance.csv.tasksTotal'), value: row => row.tasksTotal },
          { header: t('finance.csv.tasksDone'), value: row => row.tasksDone },
          { header: t('finance.csv.tasksOverdue'), value: row => row.tasksOverdue },
          { header: t('finance.csv.revisionsOpen'), value: row => row.revisionsOpen }
        ], rows)
      }

      return sendItem(res, rows)
    } catch (err) {
      next(err)
    }
  }
)

/* -------------------------------------------------------------- financial */

reportsRouter.get(
  '/financial',
  requirePermission(PERMISSION.FINANCE_VIEW),
  validate(reportQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<ReportQuery>(req)
      const report = await service.financial(toPeriod(query))

      if (query.format === 'csv') {
        if (query.section === 'categories') {
          return sendCsv(res, 'expenses-by-category', [
            { header: t('finance.csv.category'), value: row => enumLabel('expenseCategory', row.category) },
            { header: t('finance.csv.amount'), value: row => row.amount }
          ], report.byCategory)
        }
        if (query.section === 'ageing') {
          return sendCsv(res, 'receivables-ageing', [
            { header: t('finance.csv.term'), value: row => row.label },
            { header: t('finance.csv.invoicesCount'), value: row => row.count },
            { header: t('finance.csv.amount'), value: row => row.amount }
          ], report.ageing)
        }
        return sendCsv(res, 'financial-by-month', [
          { header: t('finance.csv.month'), value: row => row.month },
          { header: t('finance.csv.invoiced'), value: row => row.invoiced },
          { header: t('finance.csv.collected'), value: row => row.collected },
          { header: t('finance.csv.spent'), value: row => row.spent },
          { header: t('finance.csv.net'), value: row => row.net }
        ], report.byMonth)
      }

      return sendItem(res, report)
    } catch (err) {
      next(err)
    }
  }
)

/* ------------------------------------------------------------------- time */

reportsRouter.get(
  '/time',
  requirePermission(PERMISSION.REPORT_VIEW),
  validate(reportQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<ReportQuery>(req)
      const report = await service.time(toPeriod(query), query.projectId)

      if (query.format === 'csv') {
        return sendCsv(res, 'time', [
          { header: t('finance.csv.employee'), value: row => row.name },
          { header: t('finance.csv.position'), value: row => row.position },
          { header: t('finance.csv.department'), value: row => row.department },
          { header: t('finance.csv.rate'), value: row => row.hourlyRate },
          { header: t('finance.csv.hours'), value: row => row.hours },
          { header: t('finance.csv.unpricedHours'), value: row => row.unpricedHours },
          { header: t('finance.csv.cost'), value: row => row.cost },
          { header: t('finance.csv.projectsCount'), value: row => row.projects }
        ], report.rows)
      }

      return sendItem(res, report)
    } catch (err) {
      next(err)
    }
  }
)

/* ---------------------------------------------------------------- clients */

reportsRouter.get(
  '/clients',
  requirePermission(PERMISSION.REPORT_VIEW),
  validate(reportQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<ReportQuery>(req)
      const rows = await service.clients(toPeriod(query))

      if (query.format === 'csv') {
        return sendCsv(res, 'clients', [
          { header: t('finance.csv.client'), value: row => row.name },
          { header: t('finance.csv.status'), value: row => enumLabel('clientStatus', row.status) },
          { header: t('finance.csv.projectsCount'), value: row => row.projects },
          { header: t('finance.csv.invoicesCount'), value: row => row.invoices },
          { header: t('finance.csv.currency'), value: row => row.currency },
          { header: t('finance.csv.invoiced'), value: row => row.invoiced },
          { header: t('finance.csv.paid'), value: row => row.collected },
          { header: t('finance.csv.outstanding'), value: row => row.outstanding },
          { header: t('finance.csv.avgDaysToPay'), value: row => row.avgDaysToPay }
        ], rows)
      }

      return sendItem(res, rows)
    } catch (err) {
      next(err)
    }
  }
)
