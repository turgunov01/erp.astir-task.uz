import type { PayrollEntryType } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { notFound } from '../../lib/errors'
import { dayKey, dayValue, daysInRange, localParts } from '../../lib/studio-time'
import { isWorkingDay, penaltyFor, unworkedLateMinutes, workSchedule } from '../attendance/attendance.schedule'
import { latenessExternalId } from '../attendance/attendance.penalties'

/**
 * One employee's month day by day: when the shift started and ended, the
 * day's share of the salary, what was earned, pauses, fines and the total.
 *
 * It is the same arithmetic as the monthly calculation, spread over days so
 * an employee can see where each sum comes from:
 *
 *   day rate = salary ÷ working days of the month
 *   earned   = salary × worked ÷ month norm
 *   total    = earned + bonuses − fines − deductions − advances
 *
 * Amounts are in the salary's currency (the studio's without a salary).
 * Entries in another currency stay in the monthly calculation only.
 */

const ACCRUALS: ReadonlySet<PayrollEntryType> = new Set(['BONUS', 'OTHER_ACCRUAL'])
const FINES: ReadonlySet<PayrollEntryType> = new Set(['PENALTY', 'LATENESS'])

export interface PayrollDay {
  date: string
  isWorkingDay: boolean
  isFuture: boolean
  checkInAt: string | null
  checkOutAt: string | null
  /** Minutes of the shift, pauses already off. */
  workedMinutes: number
  pausedMinutes: number
  pauseCount: number
  lateMinutes: number
  /** The day's share of the salary; 0 on a day off or without a salary. */
  dayRate: number
  earned: number
  bonuses: number
  /** Penalties and lateness, counted automatically or by an entry. */
  fines: number
  /** Deductions and advances. */
  withheld: number
  total: number
}

const cents = (value: number) => Math.round(value * 100) / 100

function monthBounds(period: string) {
  const [year, month] = period.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: period + '-01', to: period + '-' + String(last).padStart(2, '0') }
}

export async function payrollDays(period: string, employeeId: string, now = new Date()) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      position: true,
      user: { select: { firstName: true, lastName: true } },
      salary: { select: { amount: true, currency: true } }
    }
  })
  if (!employee) throw notFound('Employee')

  const schedule = await workSchedule()
  const { from, to } = monthBounds(period)
  const dates = daysInRange(from, to)
  const today = localParts(now, schedule.timezone).date
  const salary = employee.salary ? Number(employee.salary.amount) : null
  const currency = employee.salary?.currency ?? schedule.currency
  const shiftMinutes = Math.max(0, schedule.end - schedule.start)
  const workingDays = dates.filter(date => isWorkingDay(date, schedule)).length
  const normMinutes = workingDays * shiftMinutes
  const dayRate = salary !== null && workingDays > 0 ? salary / workingDays : 0

  const [attendance, entries] = await Promise.all([
    prisma.attendanceDay.findMany({
      where: { employeeId, date: { gte: dayValue(from), lte: dayValue(to) } },
      select: {
        date: true, checkInAt: true, checkOutAt: true, workedMinutes: true,
        pausedMinutes: true, pauseCount: true, lateMinutes: true
      }
    }),
    prisma.payrollEntry.findMany({
      where: { employeeId, period },
      select: { type: true, status: true, amount: true, currency: true, date: true, externalId: true }
    })
  ])
  const byDate = new Map(attendance.map(day => [dayKey(day.date), day]))

  /* A lateness entry decides the day's fine once it is past draft. */
  const latenessDecided = new Set(entries
    .filter(entry => entry.externalId && entry.status !== 'DRAFT')
    .map(entry => entry.externalId))
  const counted = entries.filter(entry =>
    (entry.status === 'APPROVED' || entry.status === 'PAID') && entry.currency === currency)
  /* An entry dated outside the month still settles in it: put it on the first day. */
  const entryDay = (date: Date) => {
    const key = dayKey(date)
    return key >= from && key <= to ? key : from
  }

  const finesOn = schedule.penaltyPerDay > 0 || schedule.penaltyPerMinute > 0
  const days: PayrollDay[] = dates.map(date => {
    const record = byDate.get(date)
    const working = isWorkingDay(date, schedule)
    const worked = record?.workedMinutes ?? 0
    // Lateness worked off by staying late carries no fine.
    const late = record ? unworkedLateMinutes(date, record.lateMinutes, record.checkOutAt, schedule) : 0
    const earned = salary !== null && normMinutes > 0 ? salary * worked / normMinutes : 0

    let bonuses = 0
    let fines = 0
    let withheld = 0
    for (const entry of counted) {
      if (entryDay(entry.date) !== date) continue
      const amount = Number(entry.amount)
      if (ACCRUALS.has(entry.type)) bonuses += amount
      else if (FINES.has(entry.type)) fines += amount
      else withheld += amount
    }
    // Lateness without a decided entry is fined automatically, in the studio's currency.
    if (late > 0 && working && finesOn && currency === schedule.currency &&
      !latenessDecided.has(latenessExternalId(employeeId, date))) {
      fines += penaltyFor(late, schedule)
    }

    return {
      date,
      isWorkingDay: working,
      isFuture: date > today,
      checkInAt: record?.checkInAt?.toISOString() ?? null,
      checkOutAt: record?.checkOutAt?.toISOString() ?? null,
      workedMinutes: worked,
      pausedMinutes: record?.pausedMinutes ?? 0,
      pauseCount: record?.pauseCount ?? 0,
      lateMinutes: late,
      dayRate: working ? cents(dayRate) : 0,
      earned: cents(earned),
      bonuses: cents(bonuses),
      fines: cents(fines),
      withheld: cents(withheld),
      total: cents(earned + bonuses - fines - withheld)
    }
  })

  const sum = (pick: (day: PayrollDay) => number) => cents(days.reduce((acc, day) => acc + pick(day), 0))
  return {
    period,
    timezone: schedule.timezone,
    currency,
    salary,
    employee: {
      id: employee.id,
      name: employee.user.firstName + ' ' + employee.user.lastName,
      position: employee.position
    },
    totals: {
      days: dates.length,
      workingDays,
      daysStarted: days.filter(day => day.checkInAt).length,
      daysEnded: days.filter(day => day.checkOutAt).length,
      normMinutes,
      workedMinutes: days.reduce((acc, day) => acc + day.workedMinutes, 0),
      pausedMinutes: days.reduce((acc, day) => acc + day.pausedMinutes, 0),
      earned: sum(day => day.earned),
      bonuses: sum(day => day.bonuses),
      fines: sum(day => day.fines),
      withheld: sum(day => day.withheld),
      total: sum(day => day.total)
    },
    days
  }
}
