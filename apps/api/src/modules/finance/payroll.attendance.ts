import { prisma } from '../../lib/prisma'
import { dayKey, dayValue, daysInRange, localParts } from '../../lib/studio-time'
import {
  isWorkingDay,
  penaltyFor,
  shiftWindow,
  workSchedule,
  type WorkSchedule
} from '../attendance/attendance.schedule'
import { latenessExternalId } from '../attendance/attendance.penalties'

/**
 * What attendance brings into a payroll month, so the calculation is not
 * empty until somebody types entries by hand:
 *
 * - the month's norm: working days by schedule × shift length;
 * - each employee's worked time (pauses and time outside the shift already
 *   taken off by attendance);
 * - lateness fines at the configured rates, counted automatically.
 *
 * A lateness fine follows its payroll entry once one exists for that day
 * (made by «Штрафы за опоздания» on the attendance page): approved or paid
 * entries are counted as entries, a cancelled one means the fine was
 * forgiven. Without an entry — or with a draft still waiting — the fine is
 * counted here, so it is never missing and never counted twice.
 */

export interface MonthNorm {
  /** Working days in the month by schedule. */
  workingDays: number
  /** Minutes the month requires: working days × shift length. */
  normMinutes: number
  /** Of normMinutes, what has come due by now. */
  normToDateMinutes: number
  shiftMinutes: number
  start: string
  end: string
  penaltyPerDay: number
  penaltyPerMinute: number
  currency: string
}

export interface EmployeeMonth {
  workedMinutes: number
  /** Fines counted from attendance (no approved entry for the day yet). */
  lateness: number
  latenessCount: number
  lateMinutes: number
  /** Draft lateness entries already reflected in `lateness`. */
  coveredDrafts: number
}

export interface AttendanceMonth {
  norm: MonthNorm
  byEmployee: Map<string, EmployeeMonth>
}

function monthBounds(period: string) {
  const [year, month] = period.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: period + '-01', to: period + '-' + String(last).padStart(2, '0') }
}

function monthNorm(period: string, schedule: WorkSchedule, now: Date): MonthNorm {
  const { from, to } = monthBounds(period)
  const shiftMinutes = Math.max(0, schedule.end - schedule.start)
  const today = localParts(now, schedule.timezone).date
  let workingDays = 0
  let normToDateMinutes = 0
  for (const date of daysInRange(from, to)) {
    if (!isWorkingDay(date, schedule)) continue
    workingDays += 1
    if (date < today) {
      normToDateMinutes += shiftMinutes
    } else if (date === today) {
      const { startAt } = shiftWindow(date, schedule)
      const elapsed = Math.floor((now.getTime() - startAt.getTime()) / 60_000)
      normToDateMinutes += Math.min(shiftMinutes, Math.max(0, elapsed))
    }
  }
  return {
    workingDays,
    normMinutes: workingDays * shiftMinutes,
    normToDateMinutes,
    shiftMinutes,
    start: schedule.startLabel,
    end: schedule.endLabel,
    penaltyPerDay: schedule.penaltyPerDay,
    penaltyPerMinute: schedule.penaltyPerMinute,
    currency: schedule.currency
  }
}

const emptyMonth = (): EmployeeMonth => ({
  workedMinutes: 0, lateness: 0, latenessCount: 0, lateMinutes: 0, coveredDrafts: 0
})

export async function attendanceMonth(
  period: string,
  employeeId: string | undefined,
  now = new Date()
): Promise<AttendanceMonth> {
  const schedule = await workSchedule()
  const { from, to } = monthBounds(period)
  const days = await prisma.attendanceDay.findMany({
    where: {
      date: { gte: dayValue(from), lte: dayValue(to) },
      employee: { deletedAt: null },
      ...(employeeId ? { employeeId } : {})
    },
    select: { employeeId: true, date: true, workedMinutes: true, lateMinutes: true }
  })

  const late = days.filter(day => day.lateMinutes > 0 && isWorkingDay(dayKey(day.date), schedule))
  const entries = late.length === 0
    ? []
    : await prisma.payrollEntry.findMany({
      where: {
        source: 'TIMESHEET',
        externalId: { in: late.map(day => latenessExternalId(day.employeeId, dayKey(day.date))) }
      },
      select: { externalId: true, status: true }
    })
  const entryStatus = new Map(entries.map(entry => [entry.externalId, entry.status]))

  const byEmployee = new Map<string, EmployeeMonth>()
  const monthOf = (id: string) => {
    const existing = byEmployee.get(id)
    if (existing) return existing
    const created = emptyMonth()
    byEmployee.set(id, created)
    return created
  }

  for (const day of days) {
    monthOf(day.employeeId).workedMinutes += day.workedMinutes
  }

  const finesOn = schedule.penaltyPerDay > 0 || schedule.penaltyPerMinute > 0
  for (const day of late) {
    const status = entryStatus.get(latenessExternalId(day.employeeId, dayKey(day.date)))
    // Approved or paid: the entry carries it. Cancelled: forgiven.
    if (status && status !== 'DRAFT') continue
    const month = monthOf(day.employeeId)
    month.latenessCount += 1
    month.lateMinutes += day.lateMinutes
    if (finesOn) month.lateness += penaltyFor(day.lateMinutes, schedule)
    if (status === 'DRAFT') month.coveredDrafts += 1
  }

  return { norm: monthNorm(period, schedule, now), byEmployee }
}

/**
 * The part of the monthly salary earned by the time worked: salary × worked
 * ÷ norm, never above the full salary. Null when no salary is on file.
 */
export function earnedPay(salary: number | null, workedMinutes: number, normMinutes: number): number | null {
  if (salary === null) return null
  if (normMinutes <= 0) return salary
  const share = Math.min(1, workedMinutes / normMinutes)
  return Math.round(salary * share * 100) / 100
}
