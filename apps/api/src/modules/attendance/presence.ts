import { Prisma, type AttendanceDay } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { dayValue, localParts } from '../../lib/studio-time'
import { figuresFor, workSchedule, type WorkSchedule } from './attendance.schedule'

/**
 * Automatic attendance capture: the observed trail (firstSeenAt/lastSeenAt)
 * of every authenticated request.
 *
 * The arrival proper is the employee's «Я приехал» press (attendance.self).
 * Until it comes, the first activity of the day stands in for it (method
 * AUTO), so a day spent working without pressing is still counted — and
 * still late if it started late — but the board flags it «без отметки».
 * Likewise the departure follows the latest request until «Я ушёл» fixes it.
 *
 * Called from the auth middleware on every request, so it must cost nothing:
 * a per-user in-memory throttle lets at most one write through a minute, the
 * write runs detached from the request, and a failure is logged and dropped —
 * attendance is never a reason for a request to fail or wait.
 */

const TOUCH_INTERVAL_MS = 60_000
/** How long the user -> employee lookup is trusted before re-reading. */
const EMPLOYEE_CACHE_MS = 5 * 60_000

const lastTouch = new Map<string, number>()
const employeeCache = new Map<string, { employeeId: string | null, at: number }>()

async function employeeIdFor(userId: string): Promise<string | null> {
  const cached = employeeCache.get(userId)
  if (cached && Date.now() - cached.at < EMPLOYEE_CACHE_MS) return cached.employeeId
  const employee = await prisma.employee.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true }
  })
  const employeeId = employee?.id ?? null
  employeeCache.set(userId, { employeeId, at: Date.now() })
  return employeeId
}

/**
 * Arrival and departure as activity alone suggests them, leaving alone
 * whatever the employee marked with the buttons.
 */
function inferredTimes(existing: AttendanceDay, at: Date, lastSeenAt: Date): {
  checkInAt?: Date
  checkInMethod?: 'AUTO'
  checkOutAt?: Date
  checkOutMethod?: 'AUTO'
} {
  return {
    ...(existing.checkInMethod === 'BUTTON' ? {} : { checkInAt: existing.checkInAt ?? at, checkInMethod: 'AUTO' as const }),
    ...(existing.checkOutMethod === 'BUTTON' ? {} : { checkOutAt: lastSeenAt, checkOutMethod: 'AUTO' as const })
  }
}

/** Write the observation; exported for the login path and for tests. */
export async function recordPresence(userId: string, at: Date): Promise<void> {
  const employeeId = await employeeIdFor(userId)
  // Client accounts and staff without an employment record are not tracked.
  if (!employeeId) return

  const schedule = await workSchedule()
  const date = localParts(at, schedule.timezone).date
  const key = { employeeId_date: { employeeId, date: dayValue(date) } }

  let existing = await prisma.attendanceDay.findUnique({ where: key })
  if (!existing) {
    try {
      await prisma.attendanceDay.create({
        data: {
          employeeId,
          date: dayValue(date),
          firstSeenAt: at,
          lastSeenAt: at,
          checkInAt: at,
          checkOutAt: at,
          checkInMethod: 'AUTO',
          checkOutMethod: 'AUTO',
          ...figuresFor(date, at, at, schedule)
        }
      })
      return
    } catch (err) {
      // Two requests raced to open the day; the other one won, update it.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
      existing = await prisma.attendanceDay.findUnique({ where: key })
      if (!existing) return
    }
  }

  // A press can land between the read and the write; then read again and
  // build on it, so the touch never undoes «Я приехал» or «Я ушёл».
  for (let attempt = 0; attempt < 2 && existing; attempt += 1) {
    if (await touchDay(existing, date, at, schedule)) return
    existing = await prisma.attendanceDay.findUnique({ where: key })
  }
}

/**
 * Move the trail of an existing day. The write only lands if the source and
 * the marks are still what was read; false means the day changed under us.
 */
async function touchDay(existing: AttendanceDay, date: string, at: Date, schedule: WorkSchedule): Promise<boolean> {
  const lastSeenAt = existing.lastSeenAt && existing.lastSeenAt > at ? existing.lastSeenAt : at
  // A corrected or imported day keeps its times; only the raw trail moves.
  const effective = existing.source === 'WEB' ? inferredTimes(existing, at, lastSeenAt) : {}
  const checkInAt = effective.checkInAt ?? existing.checkInAt
  const checkOutAt = effective.checkOutAt ?? existing.checkOutAt
  const figures = existing.source === 'WEB' ? figuresFor(date, checkInAt, checkOutAt, schedule) : {}
  const { count } = await prisma.attendanceDay.updateMany({
    where: {
      id: existing.id,
      source: existing.source,
      checkInMethod: existing.checkInMethod,
      checkOutMethod: existing.checkOutMethod
    },
    data: { firstSeenAt: existing.firstSeenAt ?? at, lastSeenAt, ...effective, ...figures }
  })
  return count > 0
}

/**
 * Note that the user is active now. Never throws and never awaits.
 *
 * `force` skips the throttle: a sign-in must always open the day, even when a
 * request a few seconds earlier already used up this minute.
 */
export function notePresence(userId: string, force = false): void {
  const now = Date.now()
  const last = lastTouch.get(userId)
  if (!force && last !== undefined && now - last < TOUCH_INTERVAL_MS) return
  lastTouch.set(userId, now)

  recordPresence(userId, new Date(now)).catch((err: unknown) => {
    // Let the next request try again rather than waiting out the minute.
    lastTouch.delete(userId)
    logger.warn({ err, userId }, 'attendance: presence not recorded')
  })
}
