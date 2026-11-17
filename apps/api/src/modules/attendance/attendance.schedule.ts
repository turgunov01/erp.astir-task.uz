import { studioSettings } from '../../lib/settings'
import { localParts, parseClock, safeTimeZone, weekdayOf } from '../../lib/studio-time'

/**
 * The studio's working schedule and the rules that turn an arrival and a
 * departure into lateness and worked time. Kept in one place so the board,
 * the period view, a manual correction and the fines all count the same way.
 */

const DEFAULT_START = 9 * 60
const DEFAULT_END = 18 * 60

export interface WorkSchedule {
  timezone: string
  /** Minutes since local midnight. */
  start: number
  end: number
  startLabel: string
  endLabel: string
  graceMinutes: number
  /** ISO weekdays, 1 = Monday. */
  weekdays: number[]
  penaltyPerDay: number
  penaltyPerMinute: number
  currency: string
}

const clockLabel = (minutes: number) =>
  String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')

export async function workSchedule(): Promise<WorkSchedule> {
  const settings = await studioSettings()
  const start = parseClock(settings.workDayStart) ?? DEFAULT_START
  const end = parseClock(settings.workDayEnd) ?? DEFAULT_END
  return {
    timezone: safeTimeZone(settings.timezone),
    start,
    end,
    startLabel: clockLabel(start),
    endLabel: clockLabel(end),
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
