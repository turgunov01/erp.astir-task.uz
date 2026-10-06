import { prisma } from '../../lib/prisma'
import { AppError, badRequest } from '../../lib/errors'
import { dayKey, dayValue, localParts } from '../../lib/studio-time'
import * as payroll from '../finance/payroll.service'
import { isWorkingDay, penaltyFor, workSchedule } from './attendance.schedule'
import { assertRange } from './attendance.service'

/**
 * Lateness -> payroll: one LATENESS draft per late day.
 *
 * Every entry carries `attendance:<employeeId>:<date>` as its external id
 * under the TIMESHEET source, so the unique (source, externalId) index makes
 * a second run for the same period a no-op instead of fining people twice.
 * Entries are created through the payroll service, so its rules (employee
 * must exist, minutes required on lateness, currency default) apply as-is.
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
    throw badRequest('Ставка штрафа за опоздание не задана. Укажите её в Настройках → Рабочий график.')
  }

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
        reason: 'Опоздание на ' + day.lateMinutes + ' мин: приход ' + arrivalLabel +
          ' при начале в ' + schedule.startLabel + ' (активность сотрудников)',
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
