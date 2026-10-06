import { prisma } from '../../lib/prisma'
import { AppError, badRequest } from '../../lib/errors'
import { recipientLocale, t, translatorFor } from '../../i18n'
import { dayKey, dayValue, localParts } from '../../lib/studio-time'
import * as payroll from '../finance/payroll.service'
import { isWorkingDay, penaltyFor, workSchedule } from './attendance.schedule'
import { assertRange, isMarked } from './attendance.service'

/**
 * Lateness -> payroll: one LATENESS draft per late day.
 *
 * Every entry carries `attendance:<employeeId>:<date>` as its external id
 * under the TIMESHEET source, so the unique (source, externalId) index makes
 * a second run for the same period a no-op instead of fining people twice.
 * Entries are created through the payroll service, so its rules (employee
 * must exist, minutes required on lateness, currency default) apply as-is.
 *
 * Lateness counts from the «Я приехал» press. A day the employee worked
 * without pressing is not let off: its lateness counts from the first
 * activity of the day, and the entry says so (team.attendance.penaltyUnmarked), so the
 * accountant can tell an inferred arrival from a marked one.
 */

const PAYROLL_SOURCE = 'TIMESHEET' as const

export const latenessExternalId = (employeeId: string, date: string) =>
  'attendance:' + employeeId + ':' + date

export interface PenaltyRun {
  created: number
  skipped: number
  total: number
  currency: string
}

export async function createLatenessPenalties(from: string, to: string, actorId: string | undefined): Promise<PenaltyRun> {
  assertRange(from, to)
  const schedule = await workSchedule()
  if (schedule.penaltyPerDay <= 0 && schedule.penaltyPerMinute <= 0) {
    throw badRequest(t('team.attendance.penaltyRateMissing'))
  }
  /*
   * The reason is stored on the entry as plain text that the accountant may
   * edit, and everyone reads the same row, so it is worded once in the
   * studio's default language rather than in whoever pressed the button.
   */
  const studioT = translatorFor(await recipientLocale(null))

  const days = await prisma.attendanceDay.findMany({
    where: {
      date: { gte: dayValue(from), lte: dayValue(to) },
      lateMinutes: { gt: 0 },
      employee: { deletedAt: null }
    },
    orderBy: [{ date: 'asc' }]
  })
  const late = days.filter(day => isWorkingDay(dayKey(day.date), schedule))

  const ids = late.map(day => latenessExternalId(day.employeeId, dayKey(day.date)))
  const existing = await prisma.payrollEntry.findMany({
    where: { source: PAYROLL_SOURCE, externalId: { in: ids } },
    select: { externalId: true }
  })
  const done = new Set(existing.map(entry => entry.externalId))

  const run: PenaltyRun = { created: 0, skipped: 0, total: 0, currency: schedule.currency }
  for (const day of late) {
    const date = dayKey(day.date)
    const externalId = latenessExternalId(day.employeeId, date)
    const amount = penaltyFor(day.lateMinutes, schedule)
    if (done.has(externalId) || amount <= 0) {
      run.skipped += 1
      continue
    }
    const arrival = day.checkInAt
      ? localParts(day.checkInAt, schedule.timezone)
      : null
    const arrivalLabel = arrival
      ? String(Math.floor(arrival.minutes / 60)).padStart(2, '0') + ':' + String(arrival.minutes % 60).padStart(2, '0')
      : '—'
    try {
      await payroll.create({
        employeeId: day.employeeId,
        type: 'LATENESS',
        amount,
        currency: schedule.currency,
        date,
        lateMinutes: day.lateMinutes,
        reason: studioT('team.attendance.penaltyReason', {
          minutes: day.lateMinutes,
          arrival: arrivalLabel,
          start: schedule.startLabel
        }) + ' ' + studioT(isMarked(day) ? 'team.attendance.penaltyMarked' : 'team.attendance.penaltyUnmarked'),
        source: PAYROLL_SOURCE,
        externalId
      }, actorId)
      run.created += 1
      run.total += amount
    } catch (err) {
      // A concurrent run got there first: the index did its job.
      if (err instanceof AppError && err.statusCode === 409) {
        run.skipped += 1
        continue
      }
      throw err
    }
  }
  run.total = Math.round(run.total * 100) / 100
  return run
}
