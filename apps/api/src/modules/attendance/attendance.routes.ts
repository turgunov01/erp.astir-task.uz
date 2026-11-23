import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { uuidSchema } from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem } from '../../lib/http'
import { recordActivity, recordAudit } from '../../lib/activity'
import { parseClock } from '../../lib/studio-time'
import { t } from '../../i18n'
import * as service from './attendance.service'
import { createLatenessPenalties } from './attendance.penalties'
import * as self from './attendance.self'
import * as screen from './attendance.lock'

/**
 * /api/attendance — employee activity control (Verifix-style): who came in,
 * when, how late, how long they worked; manual corrections and lateness
 * fines. Corrections and fines go to the audit log, not the activity feed:
 * one person's lateness is not the studio's business.
 *
 * /me/* is every employee's own shift — start, pause, resume, end: always the caller,
 * always the server's clock. The press goes to the feed as «отметился о
 * приходе» without the time or the lateness — the event's own timestamp is
 * the arrival, and lateness stays on the attendance page.
 */

export const attendanceRouter = Router()

attendanceRouter.use(authenticate)

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => t('common.validation.dateFormat') })
  .refine(value => !Number.isNaN(Date.parse(value)), { error: () => t('common.validation.invalidDate') })

const clockSchema = z.string().trim()
  .refine(value => parseClock(value) !== null, { error: () => t('common.validation.timeFormat') })
  .nullable()

const boardSchema = z.object({ date: daySchema.optional() })
const rangeSchema = z.object({ from: daySchema, to: daySchema })
/** The period view may omit the range: it then answers month-to-date. */
const optionalRangeSchema = z.object({ from: daySchema.optional(), to: daySchema.optional() })
  .refine(range => Boolean(range.from) === Boolean(range.to), { error: () => t('common.validation.bothBounds') })
const employeeParamSchema = z.object({ employeeId: uuidSchema })
const dayParamSchema = z.object({ employeeId: uuidSchema, date: daySchema })

const correctionSchema = z.object({
  checkIn: clockSchema,
  checkOut: clockSchema,
  comment: z.string().trim().min(3, { error: () => t('team.attendance.correctionReason') }).max(500)
})

const clockOf = (value: Date | null | undefined) => value ? value.toISOString() : null

attendanceRouter.get(
  '/me/today',
  requirePermission(PERMISSION.ATTENDANCE_SELF),
  async (req, res, next) => {
    try {
      return sendMyDay(req, res)
    } catch (err) {
      next(err)
    }
  }
)

/** Answer with today's day plus the lock and the shift window. */
async function sendMyDay(req: Request, res: Response) {
  return sendItem(res, await screen.decorate(req.user!, await self.myToday(req.user!.id)))
}

/** One route per button: mark, then note it in the feed if it was new. */
function markRoute(mark: typeof self.checkIn, action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id
      const result = await mark(actorId)
      if (result.recorded) {
        await recordActivity({ actorId, entityType: 'Employee', entityId: result.employeeId, action })
      }
      return sendItem(res, await screen.decorate(req.user!, result.day), result.recorded ? 201 : 200)
    } catch (err) {
      next(err)
    }
  }
}

/* A new PIN is exactly 4 digits; one set earlier (4–6) still opens the screen. */
const pinSchema = z.string().trim().regex(/^\d{4,6}$/, { error: () => t('team.attendance.pinFormat') })
const newPinSchema = z.string().trim().regex(/^\d{4}$/, { error: () => t('team.attendance.pinFormat') })
const setPinSchema = z.object({ pin: newPinSchema, password: z.string().min(1).max(200).optional() })
const unlockSchema = z.object({ pin: pinSchema.optional(), password: z.string().min(1).max(200).optional() })
  .refine(body => Boolean(body.pin || body.password), { error: () => t('team.attendance.pinFormat') })

/** Set or replace the screen-lock PIN; replacing one needs the password. */
attendanceRouter.put(
  '/me/pin',
  requirePermission(PERMISSION.ATTENDANCE_SELF),
  validate(setPinSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof setPinSchema>
      await screen.setPin(req.user!.id, body.pin, body.password)
      await recordAudit({
        actorId: req.user!.id,
        action: 'attendance.pin_set',
        entityType: 'User',
        entityId: req.user!.id,
        ipAddress: req.ip
      })
      return sendMyDay(req, res)
    } catch (err) {
      next(err)
    }
  }
)

/** Lock icon and «Пауза»: lock the screen, pausing a running shift. */
async function lockRoute(req: Request, res: Response, next: NextFunction) {
  try {
    await screen.lock(req.user!.id)
    return sendMyDay(req, res)
  } catch (err) {
    next(err)
  }
}

/** The PIN (or the password) opens the screen and resumes the shift. */
async function unlockRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as z.infer<typeof unlockSchema>
    await screen.unlock(req.user!.id, body)
    return sendMyDay(req, res)
  } catch (err) {
    next(err)
  }
}

attendanceRouter.post('/me/lock', requirePermission(PERMISSION.ATTENDANCE_SELF), lockRoute)
attendanceRouter.post('/me/unlock', requirePermission(PERMISSION.ATTENDANCE_SELF), validate(unlockSchema), unlockRoute)

attendanceRouter.post(
  '/me/check-in',
  requirePermission(PERMISSION.ATTENDANCE_SELF),
  markRoute(self.checkIn, 'attendance.checked_in')
)

attendanceRouter.post(
  '/me/check-out',
  requirePermission(PERMISSION.ATTENDANCE_SELF),
  markRoute(self.checkOut, 'attendance.checked_out')
)

/*
 * «Пауза» is the screen lock and «Продолжить смену» is its PIN: resuming
 * without one would open a locked screen, so the old paths now go through
 * the lock as well.
 */
attendanceRouter.post('/me/pause', requirePermission(PERMISSION.ATTENDANCE_SELF), lockRoute)
attendanceRouter.post('/me/resume', requirePermission(PERMISSION.ATTENDANCE_SELF), validate(unlockSchema), unlockRoute)

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
