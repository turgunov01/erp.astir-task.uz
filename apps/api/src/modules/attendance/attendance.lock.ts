import bcrypt from 'bcryptjs'
import { PERMISSION, type Role } from '@astir/types'
import { prisma } from '../../lib/prisma'
import { hasPermission } from '../../lib/rbac'
import { AppError, badRequest } from '../../lib/errors'
import { t } from '../../i18n'
import { shiftNow, workSchedule, type ShiftState } from './attendance.schedule'
import * as self from './attendance.self'

/**
 * Screen lock with a personal PIN, and the shift's working window.
 *
 * The lock icon and «Пауза» both lock the screen; a locked screen is a
 * paused shift, so its minutes do not count as work. Only the PIN opens it
 * again — or the account password, for someone who forgot the PIN. The lock
 * lives on the user row, so reloading the page or opening another device
 * does not get around it.
 *
 * Outside the open window (before it, after it, on a day off, or once
 * «Закончить смену» was pressed) the app is closed for the employee until
 * the next shift opens. People who run attendance (attendance:manage — the
 * owner and administrators) are exempt from that window, not from the PIN.
 */

const PIN_ROUNDS = 10
const MAX_FAILURES = 5
const FAILURE_WINDOW_MS = 15 * 60_000
const PIN_PATTERN = /^\d{4}$/

interface Caller { id: string, role: Role, customRoleId: string | null }

/** Wrong PIN / password tries per user and kind, kept in memory. */
const failures = new Map<string, { count: number, since: number }>()

function tooManyFailures(key: string, now: number): boolean {
  const entry = failures.get(key)
  if (!entry) return false
  if (now - entry.since > FAILURE_WINDOW_MS) {
    failures.delete(key)
    return false
  }
  return entry.count >= MAX_FAILURES
}

/**
 * Count the attempt before checking it. Reserving the slot first means
 * parallel requests cannot all slip past the limit while the hash compares.
 */
function reserveAttempt(key: string, now: number) {
  const entry = failures.get(key)
  if (!entry || now - entry.since > FAILURE_WINDOW_MS) failures.set(key, { count: 1, since: now })
  else failures.set(key, { count: entry.count + 1, since: entry.since })
}

export interface ShiftWindow {
  state: ShiftState
  start: string
  end: string
  endsAt: Date | null
  opensAt: Date | null
}

export interface LockState {
  hasPin: boolean
  /** The screen is locked: by the icon, by «Пауза», or a pause left running. */
  locked: boolean
  /** Not closed outside the shift's hours (attendance managers). */
  windowExempt: boolean
  shift: ShiftWindow
}

export type MyDayWithLock = (self.MyDay | { tracked: false }) & LockState

/** Today's day plus the lock and the shift window, as the header reads it. */
export async function decorate(
  user: Caller,
  day: self.MyDay | { tracked: false },
  now = new Date()
): Promise<MyDayWithLock> {
  const [row, schedule, exempt] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { pinHash: true, screenLockedAt: true } }),
    workSchedule(),
    hasPermission(user, PERMISSION.ATTENDANCE_MANAGE)
  ])
  const window = shiftNow(schedule, now)
  const pausedShift = 'paused' in day && day.paused && !day.checkedOut
  return {
    ...day,
    hasPin: Boolean(row?.pinHash),
    locked: Boolean(row?.screenLockedAt) || pausedShift,
    windowExempt: exempt,
    shift: {
      state: window.state,
      // The open window: when work may begin and when the app closes.
      start: schedule.openFromLabel,
      end: schedule.openUntilLabel,
      endsAt: window.endsAt,
      opensAt: window.opensAt
    }
  }
}

async function verifyPassword(userId: string, hash: string, password: string) {
  const key = userId + ':password'
  const now = Date.now()
  if (tooManyFailures(key, now)) throw badRequest(t('team.attendance.unlockBlocked'))
  reserveAttempt(key, now)
  if (!(await bcrypt.compare(password, hash))) throw badRequest(t('team.attendance.passwordWrong'))
  failures.delete(key)
}

async function verifyPin(userId: string, hash: string, pin: string) {
  const key = userId + ':pin'
  const now = Date.now()
  if (tooManyFailures(key, now)) throw badRequest(t('team.attendance.pinBlocked'))
  reserveAttempt(key, now)
  if (!(await bcrypt.compare(pin, hash))) throw badRequest(t('team.attendance.pinWrong'))
  failures.delete(key)
}

/**
 * Set the PIN. Replacing one that exists needs the account password, so a
 * colleague at an unlocked desk cannot quietly change it.
 */
export async function setPin(userId: string, pin: string, password: string | undefined): Promise<void> {
  if (!PIN_PATTERN.test(pin)) throw badRequest(t('team.attendance.pinFormat'))
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pinHash: true, passwordHash: true } })
  if (!user) throw badRequest(t('team.attendance.staffOnly'))
  if (user.pinHash) {
    if (!password) throw badRequest(t('team.attendance.pinChangeNeedsPassword'))
    await verifyPassword(userId, user.passwordHash, password)
  }
  await prisma.user.update({ where: { id: userId }, data: { pinHash: await bcrypt.hash(pin, PIN_ROUNDS) } })
}

/** Ignore "nothing to pause/resume": the lock itself is what matters here. */
async function quietly(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (err) {
    if (!(err instanceof AppError) || err.statusCode !== 400) throw err
  }
}

/** Lock the screen; a running shift goes on pause with it. Needs a PIN. */
export async function lock(userId: string, now = new Date()): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pinHash: true } })
  if (!user?.pinHash) throw badRequest(t('team.attendance.pinRequired'))
  await prisma.user.update({ where: { id: userId }, data: { screenLockedAt: now } })
  await quietly(() => self.pause(userId, now))
}

/** Open the screen with the PIN (or the password) and resume the shift. */
export async function unlock(
  userId: string,
  secret: { pin?: string, password?: string },
  now = new Date()
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinHash: true, passwordHash: true }
  })
  if (!user) throw badRequest(t('team.attendance.staffOnly'))
  if (secret.password) {
    await verifyPassword(userId, user.passwordHash, secret.password)
  } else {
    if (!user.pinHash) throw badRequest(t('team.attendance.pinRequired'))
    await verifyPin(userId, user.pinHash, secret.pin ?? '')
  }
  await prisma.user.update({ where: { id: userId }, data: { screenLockedAt: null } })
  await quietly(() => self.resume(userId, now))
}
