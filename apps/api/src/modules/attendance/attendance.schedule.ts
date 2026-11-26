import { studioSettings } from '../../lib/settings'
import { instantAt, localParts, parseClock, parseClosingClock, safeTimeZone, weekdayOf } from '../../lib/studio-time'

/**
 * The studio's working schedule and the rules that turn an arrival and a
 * departure into lateness and worked time. Kept in one place so the board,
 * the period view, a manual correction and the fines all count the same way.
 *
 * Two windows on a working day:
 * - the working day (start–end, 09:00–18:00): lateness counts from its start,
 *   and its length is the daily norm the salary is measured against;
 * - the open window (openFrom–openUntil, 08:00–00:00), always at least as
 *   wide: the app is open and a shift can run, and every minute inside it
 *   counts as worked — coming early or staying late is paid, and staying late
 *   works off the day's lateness.
 */

const DEFAULT_START = 9 * 60
const DEFAULT_END = 18 * 60
const DEFAULT_OPEN_FROM = 8 * 60
const DEFAULT_OPEN_UNTIL = 24 * 60

export interface WorkSchedule {
  timezone: string
  /** Minutes since local midnight. */
  start: number
  end: number
  startLabel: string
  endLabel: string
  /** The open window, minutes since local midnight; openUntil may be 1440. */
  openFrom: number
  openUntil: number
  openFromLabel: string
  /** "00:00" when open until midnight. */
  openUntilLabel: string
  graceMinutes: number
  /** ISO weekdays, 1 = Monday. */
  weekdays: number[]
  penaltyPerDay: number
  penaltyPerMinute: number
  currency: string
}

/** Midnight at the end of the day (1440) reads as 00:00. */
const clockLabel = (minutes: number) => {
  const wrapped = minutes % (24 * 60)
  return String(Math.floor(wrapped / 60)).padStart(2, '0') + ':' + String(wrapped % 60).padStart(2, '0')
}

export async function workSchedule(): Promise<WorkSchedule> {
  const settings = await studioSettings()
  const start = parseClock(settings.workDayStart) ?? DEFAULT_START
  const end = parseClock(settings.workDayEnd) ?? DEFAULT_END
  // The open window never cuts into the working day, whatever was saved.
  const openFrom = Math.min(start, parseClock(settings.workOpenFrom) ?? DEFAULT_OPEN_FROM)
  const openUntil = Math.max(end, parseClosingClock(settings.workOpenUntil) ?? DEFAULT_OPEN_UNTIL)
  return {
    timezone: safeTimeZone(settings.timezone),
    start,
    end,
    startLabel: clockLabel(start),
    endLabel: clockLabel(end),
    openFrom,
    openUntil,
    openFromLabel: clockLabel(openFrom),
    openUntilLabel: clockLabel(openUntil),
    graceMinutes: Math.max(0, settings.lateGraceMinutes),
    weekdays: [...new Set(settings.workWeekdays ?? [])].filter(day => day >= 1 && day <= 7).sort((a, b) => a - b),
    penaltyPerDay: Number(settings.latePenaltyPerDay),
    penaltyPerMinute: Number(settings.latePenaltyPerMinute),
    currency: settings.currency
  }
}

export function isWorkingDay(date: string, schedule: WorkSchedule): boolean {
  return schedule.weekdays.includes(weekdayOf(date))
}

export interface DayFigures {
  lateMinutes: number
  workedMinutes: number
}

/**
 * Lateness and worked time for one day.
 *
 * Worked time is the shift's length less every pause taken in it.
 *
 * Arriving within the grace period is on time; past it, the whole delay since
 * the scheduled start counts — 09:25 against 09:00 with ten minutes' grace is
 * 25 minutes late, not 15. Days off are never late.
 */
/** The day's pauses: the finished ones and the one running, if any. */
export interface DayPauses {
  pausedMinutes: number
  pausedAt: Date | null
}

const NO_PAUSES: DayPauses = { pausedMinutes: 0, pausedAt: null }

/**
 * Minutes on pause up to `until`: the finished pauses plus the running one,
 * which counts up to `until` (never before it began).
 */
export function pauseMinutes(pauses: DayPauses, until: Date | null): number {
  let total = Math.max(0, pauses.pausedMinutes)
  if (pauses.pausedAt && until && until > pauses.pausedAt) {
    total += Math.floor((until.getTime() - pauses.pausedAt.getTime()) / 60_000)
  }
  return total
}

/** The shift's start and end as instants on one local date. */
export function shiftWindow(date: string, schedule: WorkSchedule): { startAt: Date, endAt: Date } {
  return {
    startAt: instantAt(date, schedule.start, schedule.timezone),
    endAt: instantAt(date, schedule.end, schedule.timezone)
  }
}

/** When the app opens and closes on one local date; closeAt may be the next midnight. */
export function openWindow(date: string, schedule: WorkSchedule): { openAt: Date, closeAt: Date } {
  return {
    openAt: instantAt(date, schedule.openFrom, schedule.timezone),
    closeAt: instantAt(date, schedule.openUntil, schedule.timezone)
  }
}

/** A schedule that cannot open or close anything never locks anyone out. */
export const hasShiftWindow = (schedule: WorkSchedule) =>
  schedule.weekdays.length > 0 && schedule.end > schedule.start

export type ShiftState = 'OPEN' | 'BEFORE' | 'AFTER' | 'DAY_OFF'

export interface ShiftNow {
  state: ShiftState
  /** Today's end, when today is a working day. */
  endsAt: Date | null
  /** The next moment a shift may begin; null while one is open. */
  opensAt: Date | null
}

const plusDays = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10)

/**
 * Where `now` falls against the open window: inside today's, before it,
 * after it, or on a day off — and when the next one opens. Work (and a
 * shift) can only happen while the state is OPEN.
 */
export function shiftNow(schedule: WorkSchedule, now = new Date()): ShiftNow {
  if (!hasShiftWindow(schedule)) return { state: 'OPEN', endsAt: null, opensAt: null }
  const date = localParts(now, schedule.timezone).date
  const working = isWorkingDay(date, schedule)
  const today = openWindow(date, schedule)

  if (working && now >= today.openAt && now < today.closeAt) {
    return { state: 'OPEN', endsAt: today.closeAt, opensAt: null }
  }
  if (working && now < today.openAt) {
    return { state: 'BEFORE', endsAt: today.closeAt, opensAt: today.openAt }
  }
  let opensAt: Date | null = null
  for (let offset = 1; offset <= 7 && !opensAt; offset += 1) {
    const next = plusDays(date, offset)
    if (isWorkingDay(next, schedule)) opensAt = openWindow(next, schedule).openAt
  }
  return { state: working ? 'AFTER' : 'DAY_OFF', endsAt: working ? today.closeAt : null, opensAt }
}

/**
 * Lateness the employee has not worked off. Staying past the working day's
 * end makes up for coming late: arriving 09:30 and leaving 18:30 leaves
 * nothing to fine; leaving 18:10 leaves 20 minutes. Fines and the count of
 * late days go by this; the board still shows the arrival as it was.
 */
export function unworkedLateMinutes(
  date: string,
  lateMinutes: number,
  checkOutAt: Date | null,
  schedule: WorkSchedule
): number {
  if (lateMinutes <= 0) return 0
  if (!checkOutAt) return lateMinutes
  const { endAt } = shiftWindow(date, schedule)
  const stayedLate = Math.max(0, Math.floor((checkOutAt.getTime() - endAt.getTime()) / 60_000))
  return Math.max(0, lateMinutes - stayedLate)
}

/**
 * Worked time as the shift buttons and the activity trail see it: only the
 * part inside the open window counts, and nothing on a day off — the app is
 * locked outside those hours. A manual correction does not go through here,
 * so an administrator can still record other hours by hand.
 */
export function shiftFiguresFor(
  date: string,
  checkInAt: Date | null,
  checkOutAt: Date | null,
  schedule: WorkSchedule,
  pauses: DayPauses = NO_PAUSES
): DayFigures {
  const { lateMinutes, workedMinutes } = figuresFor(date, checkInAt, checkOutAt, schedule, pauses)
  if (!hasShiftWindow(schedule) || !checkInAt || !checkOutAt) return { lateMinutes, workedMinutes }
  if (!isWorkingDay(date, schedule)) return { lateMinutes, workedMinutes: 0 }

  const { openAt, closeAt } = openWindow(date, schedule)
  const from = checkInAt > openAt ? checkInAt : openAt
  const to = checkOutAt < closeAt ? checkOutAt : closeAt
  if (to <= from) return { lateMinutes, workedMinutes: 0 }
  // A pause still running when the window closes stops counting there too.
  const paused = pauseMinutes(pauses, to)
  return {
    lateMinutes,
    workedMinutes: Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000) - paused)
  }
}

export function figuresFor(
  date: string,
  checkInAt: Date | null,
  checkOutAt: Date | null,
  schedule: WorkSchedule,
  pauses: DayPauses = NO_PAUSES
): DayFigures {
  let lateMinutes = 0
  if (checkInAt && isWorkingDay(date, schedule)) {
    const local = localParts(checkInAt, schedule.timezone)
    // An arrival recorded on a neighbouring local date (a correction typed
    // across midnight) is clamped to that day's edge.
    const minutes = local.date === date ? local.minutes : local.date < date ? 0 : 24 * 60
    if (minutes > schedule.start + schedule.graceMinutes) lateMinutes = minutes - schedule.start
  }

  // Time on «Пауза» is not work: it comes off the shift's length.
  const workedMinutes = checkInAt && checkOutAt && checkOutAt > checkInAt
    ? Math.max(0, Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60_000) - pauseMinutes(pauses, checkOutAt))
    : 0

  return { lateMinutes, workedMinutes }
}

/** The fine for one late day under the configured rates. */
export function penaltyFor(lateMinutes: number, schedule: WorkSchedule): number {
  if (lateMinutes <= 0) return 0
  const amount = schedule.penaltyPerDay + schedule.penaltyPerMinute * lateMinutes
  return Math.round(amount * 100) / 100
}
