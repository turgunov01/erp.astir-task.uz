import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { dayValue, localParts } from '../../lib/studio-time'
import { figuresFor, workSchedule } from './attendance.schedule'

/**
 * Automatic attendance capture: sign-in is the arrival, the latest
 * authenticated request is the departure estimate.
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

  const lastSeenAt = existing.lastSeenAt && existing.lastSeenAt > at ? existing.lastSeenAt : at
  const data: Prisma.AttendanceDayUpdateInput = {
    firstSeenAt: existing.firstSeenAt ?? at,
    lastSeenAt
  }
  // A corrected or imported day keeps its times; only the raw trail moves.
  if (existing.source === 'WEB') {
    const checkInAt = existing.checkInAt ?? at
    data.checkInAt = checkInAt
    data.checkOutAt = lastSeenAt
    Object.assign(data, figuresFor(date, checkInAt, lastSeenAt, schedule))
  }
  await prisma.attendanceDay.update({ where: { id: existing.id }, data })
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
