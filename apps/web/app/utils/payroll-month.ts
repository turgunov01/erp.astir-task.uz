/**
 * The payroll month as the API describes it: the schedule's norm and the
 * lateness rates, the same for everyone in the studio.
 */
export interface PayrollMonth {
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

/** Whole hours, so «162 / 176 ч» reads at a glance. */
export function wholeHours(minutes: number): string {
  return String(Math.round(minutes / 60))
}

/** Percent of `part` in `whole`, 0–100, for progress bars. */
export function shareOf(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0
}
