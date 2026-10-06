import type { AttendanceDay, Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { badRequest, notFound } from '../../lib/errors'
import { dayKey, dayValue, daysInRange, instantAt, localParts } from '../../lib/studio-time'
import { figuresFor, isWorkingDay, workSchedule, type WorkSchedule } from './attendance.schedule'

/**
 * Attendance board, period totals and manual corrections (Verifix-style
 * employee activity control). Reads only; fines live in attendance.penalties.
 */

/** Seen this recently counts as online right now. */
const ONLINE_WINDOW_MS = 5 * 60_000
/** Longest range the period view and the fines accept. */
export const MAX_RANGE_DAYS = 62

export type DayStatus = 'ONLINE' | 'PRESENT' | 'ABSENT' | 'DAY_OFF' | 'ON_LEAVE' | 'NOT_EMPLOYED' | 'UPCOMING'

const employeeSelect = {
  id: true,
  position: true,
  status: true,
  createdAt: true,
  department: { select: { id: true, name: true } },
  user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } }
} satisfies Prisma.EmployeeSelect

type BoardEmployee = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>

/** Everyone whose attendance is tracked: current staff with a working account. */
function trackedEmployees(where: Prisma.EmployeeWhereInput = {}) {
  return prisma.employee.findMany({
    where: {
      deletedAt: null,
      status: { not: 'INACTIVE' },
      user: { deletedAt: null, isActive: true },
      ...where
    },
    select: employeeSelect,
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }]
  })
}

export function today(schedule: WorkSchedule, now = new Date()): string {
  return localParts(now, schedule.timezone).date
}

function nextDay(date: string): string {
  return new Date(dayValue(date).getTime() + 86_400_000).toISOString().slice(0, 10)
}

export function assertRange(from: string, to: string) {
  if (from > to) throw badRequest('Начало периода позже его конца')
  if (daysInRange(from, to).length > MAX_RANGE_DAYS) {
    throw badRequest('Период не может быть длиннее ' + MAX_RANGE_DAYS + ' дней')
  }
}

interface StatusInput {
  date: string
  todayDate: string
  day: AttendanceDay | null
  employee: Pick<BoardEmployee, 'status' | 'createdAt'>
  schedule: WorkSchedule
  now: Date
}

/** One word for a person's day, the way the board chip shows it. */
function statusOf({ date, todayDate, day, employee, schedule, now }: StatusInput): DayStatus {
  if (day?.checkInAt) {
    const recent = day.lastSeenAt && now.getTime() - day.lastSeenAt.getTime() < ONLINE_WINDOW_MS
    return date === todayDate && recent ? 'ONLINE' : 'PRESENT'
  }
  if (date > todayDate) return 'UPCOMING'
  // Before the employment record existed there was nobody to be absent.
  if (date < localParts(employee.createdAt, schedule.timezone).date) return 'NOT_EMPLOYED'
  if (!isWorkingDay(date, schedule)) return 'DAY_OFF'
  if (employee.status === 'ON_LEAVE') return 'ON_LEAVE'
  return 'ABSENT'
}

function dayView(day: AttendanceDay | null) {
  return {
    checkInAt: day?.checkInAt ?? null,
    checkOutAt: day?.checkOutAt ?? null,
    firstSeenAt: day?.firstSeenAt ?? null,
    lastSeenAt: day?.lastSeenAt ?? null,
    lateMinutes: day?.lateMinutes ?? 0,
    workedMinutes: day?.workedMinutes ?? 0,
    source: day?.source ?? null,
    comment: day?.comment ?? null,
    correctedAt: day?.correctedAt ?? null
  }
}

function scheduleView(schedule: WorkSchedule) {
  return {
    timezone: schedule.timezone,
    start: schedule.startLabel,
    end: schedule.endLabel,
    graceMinutes: schedule.graceMinutes,
    weekdays: schedule.weekdays,
    penaltyPerDay: schedule.penaltyPerDay,
    penaltyPerMinute: schedule.penaltyPerMinute,
    currency: schedule.currency
  }
}

/** Business actions per user in the feed over [from, to). */
async function actionCounts(userIds: string[], from: Date, to: Date) {
  if (userIds.length === 0) return new Map<string, number>()
  const groups = await prisma.activityLog.groupBy({
    by: ['actorId'],
    where: { actorId: { in: userIds }, createdAt: { gte: from, lt: to } },
    _count: { _all: true }
  })
  return new Map(groups.map(group => [group.actorId as string, group._count._all]))
}

/** Every tracked employee on one local day. */
export async function board(dateParam: string | undefined, now = new Date()) {
  const schedule = await workSchedule()
  const todayDate = today(schedule, now)
  const date = dateParam ?? todayDate
  if (date > todayDate) throw badRequest('Этот день ещё не наступил')

  const employees = await trackedEmployees()
  const [days, actions] = await Promise.all([
    prisma.attendanceDay.findMany({
      where: { date: dayValue(date), employeeId: { in: employees.map(employee => employee.id) } }
    }),
    actionCounts(
      employees.map(employee => employee.user.id),
      instantAt(date, 0, schedule.timezone),
      instantAt(nextDay(date), 0, schedule.timezone)
    )
  ])
  const byEmployee = new Map(days.map(day => [day.employeeId, day]))

  const rows = employees.map(employee => {
    const day = byEmployee.get(employee.id) ?? null
    return {
      employee: {
        id: employee.id,
        position: employee.position,
        department: employee.department,
        user: employee.user
      },
      status: statusOf({ date, todayDate, day, employee, schedule, now }),
      ...dayView(day),
      actions: actions.get(employee.user.id) ?? 0
    }
  })

  return {
    date,
    today: todayDate,
    isToday: date === todayDate,
    isWorkingDay: isWorkingDay(date, schedule),
    now,
    schedule: scheduleView(schedule),
    rows
  }
}

interface Totals {
  workingDays: number
  presentDays: number
  absentDays: number
  lateDays: number
  lateMinutes: number
  workedMinutes: number
}

const emptyTotals = (): Totals => ({
  workingDays: 0, presentDays: 0, absentDays: 0, lateDays: 0, lateMinutes: 0, workedMinutes: 0
})

/**
 * Add one day to the totals. Today is not counted as missed — it is not
 * over — and days before the person was on staff are not counted at all.
 */
function accumulate(totals: Totals, status: DayStatus, day: AttendanceDay | null, date: string, todayDate: string, schedule: WorkSchedule) {
  if (status === 'NOT_EMPLOYED' || status === 'UPCOMING') return
  if (isWorkingDay(date, schedule)) totals.workingDays += 1
  if (status === 'PRESENT' || status === 'ONLINE') {
    totals.presentDays += 1
    totals.workedMinutes += day?.workedMinutes ?? 0
    if ((day?.lateMinutes ?? 0) > 0) {
      totals.lateDays += 1
      totals.lateMinutes += day?.lateMinutes ?? 0
    }
  }
  if (status === 'ABSENT' && date < todayDate) totals.absentDays += 1
}

/**
 * Totals per employee over a range, for the period view. Without a range it
 * answers the current month up to today, in the studio's calendar.
 */
export async function period(fromParam: string | undefined, toParam: string | undefined, now = new Date()) {
  const schedule = await workSchedule()
  const todayDate = today(schedule, now)
  const to = toParam ?? todayDate
  const from = fromParam ?? to.slice(0, 8) + '01'
  assertRange(from, to)
  const employees = await trackedEmployees()
  const days = await prisma.attendanceDay.findMany({
    where: {
      date: { gte: dayValue(from), lte: dayValue(to) },
      employeeId: { in: employees.map(employee => employee.id) }
    }
  })
  const byKey = new Map(days.map(day => [day.employeeId + '|' + dayKey(day.date), day]))
  const range = daysInRange(from, to)

  const rows = employees.map(employee => {
    const totals = emptyTotals()
    for (const date of range) {
      const day = byKey.get(employee.id + '|' + date) ?? null
      const status = statusOf({ date, todayDate, day, employee, schedule, now })
      accumulate(totals, status, day, date, todayDate, schedule)
    }
    return {
      employee: {
        id: employee.id,
        position: employee.position,
        department: employee.department,
        user: employee.user
      },
      totals
    }
  })

  return { from, to, today: todayDate, schedule: scheduleView(schedule), rows }
}

async function findEmployee(employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: employeeSelect
  })
  if (!employee) throw notFound('Employee')
  return employee
}

/** One employee, day by day, over a range. */
export async function employeeDays(employeeId: string, from: string, to: string, now = new Date()) {
  assertRange(from, to)
  const [employee, schedule] = await Promise.all([findEmployee(employeeId), workSchedule()])
  const todayDate = today(schedule, now)
  const days = await prisma.attendanceDay.findMany({
    where: { employeeId, date: { gte: dayValue(from), lte: dayValue(to) } },
    include: { correctedBy: { select: { id: true, firstName: true, lastName: true } } }
  })
  const byDate = new Map(days.map(day => [dayKey(day.date), day]))
  const totals = emptyTotals()

  const list = daysInRange(from, to).map(date => {
    const day = byDate.get(date) ?? null
    const status = statusOf({ date, todayDate, day, employee, schedule, now })
    accumulate(totals, status, day, date, todayDate, schedule)
    return {
      date,
      isWorkingDay: isWorkingDay(date, schedule),
      status,
      ...dayView(day),
      correctedBy: day?.correctedBy ?? null
    }
  })

  return {
    employee: {
      id: employee.id,
      position: employee.position,
      department: employee.department,
      user: employee.user
    },
    from,
    to,
    today: todayDate,
    schedule: scheduleView(schedule),
    days: list,
    totals
  }
}

export interface CorrectionInput {
  /** HH:MM local, or null to clear. */
  checkIn: number | null
  checkOut: number | null
  comment: string
}

/**
 * Set a day's arrival and departure by hand.
 *
 * The automatic trail (firstSeenAt/lastSeenAt) stays as observed so the
 * correction can always be compared with what the app saw; the day moves to
 * MANUAL and later activity no longer overwrites the corrected times.
 */
export async function correctDay(
  employeeId: string,
  date: string,
  input: CorrectionInput,
  actorId: string | undefined,
  now = new Date()
) {
  const [, schedule] = await Promise.all([findEmployee(employeeId), workSchedule()])
  if (date > today(schedule, now)) throw badRequest('Нельзя исправить день, который ещё не наступил')
  if (input.checkIn === null && input.checkOut !== null) {
    throw badRequest('Укажите время прихода — без него время ухода ничего не значит')
  }
  if (input.checkIn !== null && input.checkOut !== null && input.checkOut <= input.checkIn) {
    throw badRequest('Уход должен быть позже прихода')
  }

  const checkInAt = input.checkIn === null ? null : instantAt(date, input.checkIn, schedule.timezone)
  const checkOutAt = input.checkOut === null ? null : instantAt(date, input.checkOut, schedule.timezone)
  const key = { employeeId_date: { employeeId, date: dayValue(date) } }
  const before = await prisma.attendanceDay.findUnique({ where: key })

  const data = {
    checkInAt,
    checkOutAt,
    ...figuresFor(date, checkInAt, checkOutAt, schedule),
    source: 'MANUAL' as const,
    correctedById: actorId ?? null,
    correctedAt: now,
    comment: input.comment
  }
  const after = await prisma.attendanceDay.upsert({
    where: key,
    create: { employeeId, date: dayValue(date), ...data },
    update: data
  })
  return { before, after }
}

/** Drop a manual correction and go back to what the app observed. */
export async function resetDay(employeeId: string, date: string) {
  const [, schedule] = await Promise.all([findEmployee(employeeId), workSchedule()])
  const key = { employeeId_date: { employeeId, date: dayValue(date) } }
  const before = await prisma.attendanceDay.findUnique({ where: key })
  if (!before || before.source !== 'MANUAL') throw badRequest('Этот день не исправлялся вручную')

  if (!before.firstSeenAt) {
    // Nothing was observed that day: without the correction there is no day.
    await prisma.attendanceDay.delete({ where: { id: before.id } })
    return { before, after: null }
  }
  const after = await prisma.attendanceDay.update({
    where: { id: before.id },
    data: {
      checkInAt: before.firstSeenAt,
      checkOutAt: before.lastSeenAt,
      ...figuresFor(date, before.firstSeenAt, before.lastSeenAt, schedule),
      source: 'WEB',
      correctedById: null,
      correctedAt: null,
      comment: null
    }
  })
  return { before, after }
}
