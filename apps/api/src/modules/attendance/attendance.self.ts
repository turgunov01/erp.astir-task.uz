import { Prisma, type AttendanceDay } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { badRequest } from '../../lib/errors'
import { t } from '../../i18n'
import { dayValue } from '../../lib/studio-time'
import {
  hasShiftWindow,
  isWorkingDay,
  pauseMinutes,
  shiftFiguresFor,
  shiftNow,
  shiftWindow,
  workSchedule,
  type ShiftState,
  type WorkSchedule
} from './attendance.schedule'
import { isMarked, today } from './attendance.service'

/**
 * The employee's own shift in the header: «Начать смену», «Пауза»,
 * «Продолжить смену» and «Закончить смену».
 *
 * Times are always the server's clock at the moment of the request — the
 * client never sends one. Both actions are idempotent: pressing again answers
 * with what is already recorded instead of moving it. A day an administrator
 * corrected (or an access-control system imported) belongs to them, and the
 * buttons do not overwrite it.
 *
 * A pause stops the shift's clock until «Продолжить смену»: every minute on
 * pause comes off the day's worked time. Ending the shift while paused
 * closes the pause at that moment.
 */

export interface MyDay {
  /** False for an account with no employment record: nothing to mark. */
  tracked: boolean
  date: string
  timezone: string
  isWorkingDay: boolean
  start: string
  graceMinutes: number
  checkInAt: Date | null
  checkOutAt: Date | null
  lateMinutes: number
  workedMinutes: number
  /** «Я приехал» was pressed (or an administrator set the arrival). */
  checkedIn: boolean
  /** «Я ушёл» was pressed (or an administrator set the departure). */
  checkedOut: boolean
  /** The day was corrected by hand or imported; the buttons are locked. */
  corrected: boolean
  /** First activity of the day, shown while the arrival is not marked. */
  firstSeenAt: Date | null
  /** The shift is on «Пауза» right now. */
  paused: boolean
  /** When the running pause began. */
  pausedAt: Date | null
  /** Minutes on pause so far today, the running pause included. */
  pausedMinutes: number
  /** Of pausedMinutes: the finished pauses only, for a live timer. */
  finishedPauseMinutes: number
  pauseCount: number
}

export interface MarkResult {
  day: MyDay
  /** True when this call recorded the mark; false when it already was. */
  recorded: boolean
  employeeId: string
}

const isCheckedOut = (day: AttendanceDay) =>
  Boolean(day.checkOutAt) && (day.source !== 'WEB' || day.checkOutMethod === 'BUTTON')

const isCheckedIn = (day: AttendanceDay) => Boolean(day.checkInAt) && isMarked(day)

const later = (a: Date | null, b: Date) => (a && a > b ? a : b)

async function employeeIdOf(userId: string): Promise<string | null> {
  const employee = await prisma.employee.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true }
  })
  return employee?.id ?? null
}

/**
 * Studio accounts without an employee card (the system administrator) may
 * still run a shift. A client account may not, and neither may someone whose
 * card was deleted from the team on purpose.
 */
async function canStartCard(userId: string): Promise<boolean> {
  const [user, card] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { clientId: true, deletedAt: true } }),
    prisma.employee.findUnique({ where: { userId }, select: { id: true } })
  ])
  return Boolean(user && !user.clientId && !user.deletedAt && !card)
}

/** The first shift press of such an account opens its employee card. */
async function requireEmployee(userId: string): Promise<string> {
  const employeeId = await employeeIdOf(userId)
  if (employeeId) return employeeId
  if (!(await canStartCard(userId))) throw badRequest(t('team.attendance.staffOnly'))
  try {
    const card = await prisma.employee.create({
      data: { userId, position: t('team.attendance.ownPosition') },
      select: { id: true }
    })
    return card.id
  } catch (err) {
    // A second press in the same instant already opened it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await employeeIdOf(userId)
      if (raced) return raced
    }
    throw err
  }
}

function view(date: string, schedule: WorkSchedule, day: AttendanceDay | null, now = new Date()): MyDay {
  const paused = Boolean(day?.pausedAt)
  return {
    tracked: true,
    date,
    timezone: schedule.timezone,
    isWorkingDay: isWorkingDay(date, schedule),
    start: schedule.startLabel,
    graceMinutes: schedule.graceMinutes,
    checkInAt: day && isCheckedIn(day) ? day.checkInAt : null,
    checkOutAt: day && isCheckedOut(day) ? day.checkOutAt : null,
    lateMinutes: day && isCheckedIn(day) ? day.lateMinutes : 0,
    workedMinutes: day?.workedMinutes ?? 0,
    checkedIn: Boolean(day && isCheckedIn(day)),
    checkedOut: Boolean(day && isCheckedOut(day)),
    corrected: Boolean(day && day.source !== 'WEB'),
    firstSeenAt: day?.firstSeenAt ?? null,
    paused,
    pausedAt: day?.pausedAt ?? null,
    pausedMinutes: day ? pauseMinutes(day, paused ? now : day.checkOutAt) : 0,
    finishedPauseMinutes: day?.pausedMinutes ?? 0,
    pauseCount: day?.pauseCount ?? 0
  }
}

async function context(userId: string, now: Date) {
  const employeeId = await requireEmployee(userId)
  const schedule = await workSchedule()
  const date = today(schedule, now)
  const key = { employeeId_date: { employeeId, date: dayValue(date) } }
  return { employeeId, schedule, date, key }
}

/** Today's marks for the header button. */
export async function myToday(userId: string, now = new Date()): Promise<MyDay | { tracked: false }> {
  const employeeId = await employeeIdOf(userId)
  if (!employeeId) {
    if (!(await canStartCard(userId))) return { tracked: false }
    // No card yet: an empty day, so «Начать смену» shows and opens one.
    const schedule = await workSchedule()
    return view(today(schedule, now), schedule, null, now)
  }
  const schedule = await workSchedule()
  const date = today(schedule, now)
  const day = await prisma.attendanceDay.findUnique({
    where: { employeeId_date: { employeeId, date: dayValue(date) } }
  })
  return view(date, schedule, day, now)
}

/** Open the day with the press as its arrival. False when someone else opened it first. */
async function createMarked(employeeId: string, date: string, schedule: WorkSchedule, now: Date): Promise<boolean> {
  try {
    await prisma.attendanceDay.create({
      data: {
        employeeId,
        date: dayValue(date),
        firstSeenAt: now,
        lastSeenAt: now,
        checkInAt: now,
        checkOutAt: now,
        checkInMethod: 'BUTTON',
        checkOutMethod: 'AUTO',
        ...shiftFiguresFor(date, now, now, schedule)
      }
    })
    return true
  } catch (err) {
    // The request's own presence touch raced us to open the day.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false
    throw err
  }
}

/**
 * Turn an activity-only day into a marked one. The guard in the WHERE makes
 * two simultaneous presses record one time: the second finds nothing to
 * update and reports the first one's.
 */
async function markExisting(day: AttendanceDay, date: string, schedule: WorkSchedule, now: Date): Promise<boolean> {
  const checkOutAt = later(day.lastSeenAt, now)
  const { count } = await prisma.attendanceDay.updateMany({
    where: { id: day.id, source: 'WEB', OR: [{ checkInMethod: null }, { checkInMethod: 'AUTO' }] },
    data: {
      checkInAt: now,
      checkInMethod: 'BUTTON',
      checkOutAt,
      checkOutMethod: 'AUTO',
      firstSeenAt: day.firstSeenAt ?? now,
      lastSeenAt: checkOutAt,
      ...shiftFiguresFor(date, now, checkOutAt, schedule, day)
    }
  })
  return count > 0
}

/**
 * Where a pause stops counting: now, or the shift's end if that came first.
 * Worked time is clamped to the shift, so a pause running past the end must
 * not take minutes off the hours inside it.
 */
function pauseEnd(date: string, schedule: WorkSchedule, now: Date): Date {
  if (!hasShiftWindow(schedule) || !isWorkingDay(date, schedule)) return now
  const { endAt } = shiftWindow(date, schedule)
  return now > endAt ? endAt : now
}

/** A shift can only begin inside the schedule's hours on a working day. */
function assertShiftOpen(schedule: WorkSchedule, state: ShiftState) {
  if (state === 'OPEN') return
  if (state === 'BEFORE') throw badRequest(t('team.attendance.shiftNotStarted', { start: schedule.startLabel }))
  if (state === 'AFTER') throw badRequest(t('team.attendance.shiftOver', { end: schedule.endLabel }))
  throw badRequest(t('team.attendance.shiftDayOff'))
}

/** «Я приехал»: record the arrival now, or answer with the one already recorded. */
export async function checkIn(userId: string, now = new Date()): Promise<MarkResult> {
  const { employeeId, schedule, date, key } = await context(userId, now)
  const existing = await prisma.attendanceDay.findUnique({ where: key })

  if (existing && isCheckedIn(existing)) {
    return { day: view(date, schedule, existing, now), recorded: false, employeeId }
  }
  if (existing && existing.source !== 'WEB') {
    throw badRequest(t('team.attendance.correctedByAdmin'))
  }
  assertShiftOpen(schedule, shiftNow(schedule, now).state)

  let recorded = existing
    ? await markExisting(existing, date, schedule, now)
    : await createMarked(employeeId, date, schedule, now)
  if (!recorded && !existing) {
    const opened = await prisma.attendanceDay.findUnique({ where: key })
    if (opened && !isCheckedIn(opened)) recorded = await markExisting(opened, date, schedule, now)
  }

  const day = await prisma.attendanceDay.findUnique({ where: key })
  return { day: view(date, schedule, day, now), recorded, employeeId }
}

/** «Я ушёл»: fix the departure now. Needs today's arrival first. */
export async function checkOut(userId: string, now = new Date()): Promise<MarkResult> {
  const { employeeId, schedule, date, key } = await context(userId, now)
  const existing = await prisma.attendanceDay.findUnique({ where: key })

  if (!existing || !isCheckedIn(existing) || !existing.checkInAt) {
    throw badRequest(t('team.attendance.checkInFirst'))
  }
  if (isCheckedOut(existing)) {
    return { day: view(date, schedule, existing, now), recorded: false, employeeId }
  }
  if (existing.source !== 'WEB') {
    throw badRequest(t('team.attendance.checkOutByAdmin'))
  }

  // Ending the shift on pause closes the pause now: it is still deducted.
  const pausedMinutes = pauseMinutes(existing, pauseEnd(date, schedule, now))
  const { count } = await prisma.attendanceDay.updateMany({
    where: {
      id: existing.id,
      source: 'WEB',
      checkInMethod: 'BUTTON',
      pausedAt: existing.pausedAt,
      OR: [{ checkOutMethod: null }, { checkOutMethod: 'AUTO' }]
    },
    data: {
      checkOutAt: now,
      checkOutMethod: 'BUTTON',
      lastSeenAt: later(existing.lastSeenAt, now),
      pausedAt: null,
      pausedMinutes,
      ...shiftFiguresFor(date, existing.checkInAt, now, schedule, { pausedMinutes, pausedAt: null })
    }
  })

  const day = await prisma.attendanceDay.findUnique({ where: key })
  return { day: view(date, schedule, day, now), recorded: count > 0, employeeId }
}

/** The shift is running: marked arrival, no departure, not corrected. */
async function runningShift(userId: string, now: Date) {
  const ctx = await context(userId, now)
  const existing = await prisma.attendanceDay.findUnique({ where: ctx.key })
  if (!existing || !isCheckedIn(existing) || !existing.checkInAt) {
    throw badRequest(t('team.attendance.checkInFirst'))
  }
  if (existing.source !== 'WEB') throw badRequest(t('team.attendance.correctedByAdmin'))
  if (isCheckedOut(existing)) throw badRequest(t('team.attendance.shiftEnded'))
  return { ...ctx, existing, checkInAt: existing.checkInAt }
}

/** «Пауза»: stop the shift's clock now, or answer with the pause already running. */
export async function pause(userId: string, now = new Date()): Promise<MarkResult> {
  const { employeeId, schedule, date, key, existing, checkInAt } = await runningShift(userId, now)
  if (existing.pausedAt) {
    return { day: view(date, schedule, existing, now), recorded: false, employeeId }
  }

  const { count } = await prisma.attendanceDay.updateMany({
    where: { id: existing.id, source: 'WEB', pausedAt: null, checkOutMethod: existing.checkOutMethod },
    data: {
      pausedAt: now,
      pauseCount: { increment: 1 },
      // The shift so far runs up to the press.
      checkOutAt: later(existing.checkOutAt, now),
      lastSeenAt: later(existing.lastSeenAt, now),
      ...shiftFiguresFor(date, checkInAt, later(existing.checkOutAt, now), schedule, { pausedMinutes: existing.pausedMinutes, pausedAt: now })
    }
  })

  const day = await prisma.attendanceDay.findUnique({ where: key })
  return { day: view(date, schedule, day, now), recorded: count > 0, employeeId }
}

/** «Продолжить смену»: close the running pause; its minutes come off the day. */
export async function resume(userId: string, now = new Date()): Promise<MarkResult> {
  const { employeeId, schedule, date, key, existing, checkInAt } = await runningShift(userId, now)
  if (!existing.pausedAt) {
    return { day: view(date, schedule, existing, now), recorded: false, employeeId }
  }

  const pausedMinutes = pauseMinutes(existing, pauseEnd(date, schedule, now))
  const checkOutAt = later(existing.checkOutAt, now)
  const { count } = await prisma.attendanceDay.updateMany({
    // Only the pause that was read: two presses close it once.
    where: { id: existing.id, source: 'WEB', pausedAt: existing.pausedAt },
    data: {
      pausedAt: null,
      pausedMinutes,
      checkOutAt,
      lastSeenAt: later(existing.lastSeenAt, now),
      ...shiftFiguresFor(date, checkInAt, checkOutAt, schedule, { pausedMinutes, pausedAt: null })
    }
  })

  const day = await prisma.attendanceDay.findUnique({ where: key })
  return { day: view(date, schedule, day, now), recorded: count > 0, employeeId }
}
