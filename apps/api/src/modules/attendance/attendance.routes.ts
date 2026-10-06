import { Router } from 'express'
import { z } from 'zod'
import { uuidSchema } from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem } from '../../lib/http'
import { recordAudit } from '../../lib/activity'
import { parseClock } from '../../lib/studio-time'
import * as service from './attendance.service'
import { createLatenessPenalties } from './attendance.penalties'

/**
 * /api/attendance — employee activity control (Verifix-style): who came in,
 * when, how late, how long they worked; manual corrections and lateness
 * fines. Corrections and fines go to the audit log, not the activity feed:
 * one person's lateness is not the studio's business.
 */

export const attendanceRouter = Router()

attendanceRouter.use(authenticate)

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата ГГГГ-ММ-ДД')
  .refine(value => !Number.isNaN(Date.parse(value)), 'Некорректная дата')

const clockSchema = z.string().trim()
  .refine(value => parseClock(value) !== null, 'Ожидается время ЧЧ:ММ')
  .nullable()

const boardSchema = z.object({ date: daySchema.optional() })
const rangeSchema = z.object({ from: daySchema, to: daySchema })
/** The period view may omit the range: it then answers month-to-date. */
const optionalRangeSchema = z.object({ from: daySchema.optional(), to: daySchema.optional() })
  .refine(range => Boolean(range.from) === Boolean(range.to), 'Укажите обе границы периода')
const employeeParamSchema = z.object({ employeeId: uuidSchema })
const dayParamSchema = z.object({ employeeId: uuidSchema, date: daySchema })

const correctionSchema = z.object({
  checkIn: clockSchema,
  checkOut: clockSchema,
  comment: z.string().trim().min(3, 'Опишите причину исправления').max(500)
})

const clockOf = (value: Date | null | undefined) => value ? value.toISOString() : null

attendanceRouter.get(
  '/board',
  requirePermission(PERMISSION.ATTENDANCE_VIEW),
  validate(boardSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<z.infer<typeof boardSchema>>(req)
      return sendItem(res, await service.board(query.date))
    } catch (err) {
      next(err)
    }
  }
)

attendanceRouter.get(
  '/period',
  requirePermission(PERMISSION.ATTENDANCE_VIEW),
  validate(optionalRangeSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<z.infer<typeof optionalRangeSchema>>(req)
      return sendItem(res, await service.period(query.from, query.to))
    } catch (err) {
      next(err)
    }
  }
)

attendanceRouter.get(
  '/employees/:employeeId/days',
  requirePermission(PERMISSION.ATTENDANCE_VIEW),
  validate(employeeParamSchema, 'params'),
  validate(rangeSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<z.infer<typeof rangeSchema>>(req)
      const { employeeId } = req.params as z.infer<typeof employeeParamSchema>
      return sendItem(res, await service.employeeDays(employeeId, query.from, query.to))
    } catch (err) {
      next(err)
    }
  }
)

attendanceRouter.put(
  '/employees/:employeeId/days/:date',
  requirePermission(PERMISSION.ATTENDANCE_MANAGE),
  validate(dayParamSchema, 'params'),
  validate(correctionSchema),
  async (req, res, next) => {
    try {
      const { employeeId, date } = req.params as z.infer<typeof dayParamSchema>
      const body = req.body as z.infer<typeof correctionSchema>
      const { before, after } = await service.correctDay(employeeId, date, {
        checkIn: parseClock(body.checkIn),
        checkOut: parseClock(body.checkOut),
        comment: body.comment
      }, req.user?.id)

      await recordAudit({
        actorId: req.user?.id,
        action: 'attendance.corrected',
        entityType: 'Employee',
        entityId: employeeId,
        ipAddress: req.ip,
        metadata: {
          date,
          comment: body.comment,
          fromCheckIn: clockOf(before?.checkInAt),
          fromCheckOut: clockOf(before?.checkOutAt),
          toCheckIn: clockOf(after.checkInAt),
          toCheckOut: clockOf(after.checkOutAt),
          lateMinutes: after.lateMinutes
        }
      })

      return sendItem(res, after)
    } catch (err) {
      next(err)
    }
  }
)

attendanceRouter.delete(
  '/employees/:employeeId/days/:date/correction',
  requirePermission(PERMISSION.ATTENDANCE_MANAGE),
  validate(dayParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { employeeId, date } = req.params as z.infer<typeof dayParamSchema>
      const { before, after } = await service.resetDay(employeeId, date)

      await recordAudit({
        actorId: req.user?.id,
        action: 'attendance.correction_reset',
        entityType: 'Employee',
        entityId: employeeId,
        ipAddress: req.ip,
        metadata: {
          date,
          fromCheckIn: clockOf(before.checkInAt),
          fromCheckOut: clockOf(before.checkOutAt),
          toCheckIn: clockOf(after?.checkInAt),
          toCheckOut: clockOf(after?.checkOutAt)
        }
      })

      return sendItem(res, after)
    } catch (err) {
      next(err)
    }
  }
)

/** Turn the period's lateness into payroll drafts. Safe to run again. */
attendanceRouter.post(
  '/penalties',
  requirePermission(PERMISSION.ATTENDANCE_MANAGE),
  requirePermission(PERMISSION.PAYROLL_MANAGE),
  validate(rangeSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof rangeSchema>
      const run = await createLatenessPenalties(body.from, body.to, req.user?.id)

      await recordAudit({
        actorId: req.user?.id,
        action: 'attendance.penalties_created',
        entityType: 'PayrollEntry',
        ipAddress: req.ip,
        metadata: {
          from: body.from,
          to: body.to,
          created: run.created,
          skipped: run.skipped,
          total: run.total,
          currency: run.currency
        }
      })

      return sendItem(res, run, run.created > 0 ? 201 : 200)
    } catch (err) {
      next(err)
    }
  }
)
