import { Router } from 'express'
import type { Response } from 'express'
import { z } from 'zod'
import { uuidSchema } from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem } from '../../lib/http'
import * as service from './reports.service'

export const reportsRouter = Router()

reportsRouter.use(authenticate)

const isoDate = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')
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

/* -------------------------------------------------------------------- csv */

type CsvValue = string | number | boolean | Date | null | undefined

interface CsvColumn<T> {
  header: string
  value: (row: T) => CsvValue
}

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value)
  // Quote only what would otherwise break the row apart.
  return /[",\n\r;]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text
}

function toCsv<T>(columns: Array<CsvColumn<T>>, rows: T[]): string {
  const lines = [columns.map(column => csvCell(column.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map(column => csvCell(column.value(row))).join(','))
  }
  return lines.join('\r\n')
}

/**
 * Send a CSV the way a spreadsheet expects one.
 *
 * The BOM is not decoration: without it Excel reads the file in the system
 * codepage and every Cyrillic heading arrives as mojibake. CRLF is what the
 * format specifies and what older spreadsheet tools still require.
 */
function sendCsv<T>(
  res: Response,
  filename: string,
  columns: Array<CsvColumn<T>>,
  rows: T[]
) {
  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}-${stamp}.csv"`)
  return res.send('﻿' + toCsv(columns, rows))
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
          { header: 'Статус', value: row => row.status },
          { header: 'Риск', value: row => row.risk },
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
            { header: 'Категория', value: row => row.category },
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
          { header: 'Статус', value: row => row.status },
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
