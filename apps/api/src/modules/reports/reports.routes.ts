import { Router } from 'express'
import { z } from 'zod'
import { uuidSchema } from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem } from '../../lib/http'
import { sendCsv } from '../../lib/csv'
import {
  CLIENT_STATUS_RU, EXPENSE_CATEGORY_RU, PROJECT_STATUS_RU, RISK_RU, labelRu
} from '../../lib/labels-ru'
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
          { header: 'Код', value: row => row.code },
          { header: 'Проект', value: row => row.name },
          { header: 'Статус', value: row => labelRu(PROJECT_STATUS_RU, row.status) },
          { header: 'Риск', value: row => labelRu(RISK_RU, row.risk) },
          { header: 'Прогресс, %', value: row => row.progress },
          { header: 'Дедлайн', value: row => row.deadline },
          { header: 'Просрочен', value: row => (row.late ? 'да' : 'нет') },
          { header: 'Этапов всего', value: row => row.stagesTotal },
          { header: 'Этапов готово', value: row => row.stagesDone },
          { header: 'Задач всего', value: row => row.tasksTotal },
          { header: 'Задач готово', value: row => row.tasksDone },
          { header: 'Задач просрочено', value: row => row.tasksOverdue },
          { header: 'Открытых правок', value: row => row.revisionsOpen }
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
            { header: 'Категория', value: row => labelRu(EXPENSE_CATEGORY_RU, row.category) },
            { header: 'Сумма', value: row => row.amount }
          ], report.byCategory)
        }
        if (query.section === 'ageing') {
          return sendCsv(res, 'receivables-ageing', [
            { header: 'Срок', value: row => row.label },
            { header: 'Счетов', value: row => row.count },
            { header: 'Сумма', value: row => row.amount }
          ], report.ageing)
        }
        return sendCsv(res, 'financial-by-month', [
          { header: 'Месяц', value: row => row.month },
          { header: 'Выставлено', value: row => row.invoiced },
          { header: 'Получено', value: row => row.collected },
          { header: 'Потрачено', value: row => row.spent },
          { header: 'Итого', value: row => row.net }
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
          { header: 'Сотрудник', value: row => row.name },
          { header: 'Должность', value: row => row.position },
          { header: 'Отдел', value: row => row.department },
          { header: 'Ставка', value: row => row.hourlyRate },
          { header: 'Часов', value: row => row.hours },
          { header: 'Часов без ставки', value: row => row.unpricedHours },
          { header: 'Стоимость', value: row => row.cost },
          { header: 'Проектов', value: row => row.projects }
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
          { header: 'Клиент', value: row => row.name },
          { header: 'Статус', value: row => labelRu(CLIENT_STATUS_RU, row.status) },
          { header: 'Проектов', value: row => row.projects },
          { header: 'Счетов', value: row => row.invoices },
          { header: 'Валюта', value: row => row.currency },
          { header: 'Выставлено', value: row => row.invoiced },
          { header: 'Оплачено', value: row => row.collected },
          { header: 'Остаток', value: row => row.outstanding },
          { header: 'Средний срок оплаты, дней', value: row => row.avgDaysToPay }
        ], rows)
      }

      return sendItem(res, rows)
    } catch (err) {
      next(err)
    }
  }
)
