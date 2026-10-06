/**
 * Shared vocabulary of the employee activity page: statuses, their colours,
 * and the clock/duration formatting every table on it uses.
 */

/**
 * PRESENT: pressed «Я приехал» (or an administrator set the arrival).
 * UNMARKED: seen in the app that day, but never pressed the button.
 */
export type AttendanceStatus =
  | 'PRESENT' | 'UNMARKED' | 'ABSENT' | 'DAY_OFF' | 'ON_LEAVE' | 'NOT_EMPLOYED' | 'UPCOMING'

export type AttendanceMethod = 'BUTTON' | 'AUTO'

export interface AttendancePerson {
  id: string
  position: string
  department: { id: string, name: string } | null
  user: { id: string, firstName: string, lastName: string, avatarUrl: string | null }
}

export interface AttendanceSchedule {
  timezone: string
  start: string
  end: string
  graceMinutes: number
  weekdays: number[]
  penaltyPerDay: number
  penaltyPerMinute: number
  currency: string
}

export interface AttendanceDayFields {
  checkInAt: string | null
  checkOutAt: string | null
  checkInMethod: AttendanceMethod | null
  checkOutMethod: AttendanceMethod | null
  firstSeenAt: string | null
  lastSeenAt: string | null
  lateMinutes: number
  workedMinutes: number
  source: 'WEB' | 'MANUAL' | 'EXTERNAL' | null
  comment: string | null
  correctedAt: string | null
}

export interface AttendanceTotals {
  workingDays: number
  presentDays: number
  unmarkedDays: number
  absentDays: number
  lateDays: number
  lateMinutes: number
  workedMinutes: number
}

/** The chip wording; the board spells "не отметился" out in full. */
export function attendanceStatusLabel(status: AttendanceStatus, isToday: boolean): string {
  switch (status) {
    case 'PRESENT': return 'Отметился'
    case 'UNMARKED': return isToday ? 'В системе, не отметился' : 'Без отметки'
    case 'ABSENT': return isToday ? 'Не пришёл' : 'Не было'
    case 'DAY_OFF': return 'Выходной'
    case 'ON_LEAVE': return 'Отпуск'
    case 'NOT_EMPLOYED': return 'Не в штате'
    case 'UPCOMING': return '—'
  }
}

export const ATTENDANCE_STATUS_CLASS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  UNMARKED: 'bg-amber-500/12 text-amber-800 dark:text-amber-300',
  ABSENT: 'bg-destructive/12 text-destructive',
  DAY_OFF: 'bg-secondary text-muted-foreground',
  ON_LEAVE: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  NOT_EMPLOYED: 'bg-secondary text-muted-foreground',
  UPCOMING: 'bg-secondary text-muted-foreground'
}

export const ATTENDANCE_SOURCE_LABEL: Record<string, string> = {
  WEB: 'Автоматически',
  MANUAL: 'Исправлено вручную',
  EXTERNAL: 'Из системы контроля доступа'
}

/** Short weekday name for an ISO weekday (1 = Monday ... 7 = Sunday), in the current language. */
export function weekdayShort(isoDay: number): string {
  return translate('common.weekdayShort.' + isoDay)
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>()

/** HH:MM of an instant on the studio's clock, not the browser's. */
export function studioClock(value: string | null | undefined, timeZone: string): string {
  if (!value) return '—'
  const cacheKey = intlTag() + '|' + timeZone
  let formatter = clockFormatters.get(cacheKey)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlTag(), { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    clockFormatters.set(cacheKey, formatter)
  }
  return formatter.format(new Date(value))
}

/** 485 -> "8 ч 05 мин" (in the current language); 0 -> "—". */
export function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes) return '—'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return translate('common.units.minutes', { m: rest })
  return translate('common.units.hoursMinutes', { h: hours, m: String(rest).padStart(2, '0') })
}

/** ISO weekday of a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const day = new Date(date + 'T00:00:00Z').getUTCDay()
  return day === 0 ? 7 : day
}

/** "2026-10-06" -> "06.10, Вт" (weekday in the current language). */
export function shortDate(date: string): string {
  return date.slice(8, 10) + '.' + date.slice(5, 7) + ', ' + weekdayShort(isoWeekday(date))
}

/** Shift a YYYY-MM-DD date by whole days. */
export function shiftDate(date: string, days: number): string {
  const moved = new Date(new Date(date + 'T00:00:00Z').getTime() + days * 86_400_000)
  return moved.toISOString().slice(0, 10)
}

/** Monday of the week a date falls in. */
export function weekStart(date: string): string {
  return shiftDate(date, 1 - isoWeekday(date))
}

/** Working weekdays as text: [1..5] -> "Пн–Пт". */
export function weekdaysLabel(days: number[]): string {
  if (days.length === 0) return translate('common.noWorkdays')
  const sorted = [...days].sort((a, b) => a - b)
  const contiguous = sorted.every((day, index) => index === 0 || day === (sorted[index - 1] ?? 0) + 1)
  if (contiguous && sorted.length > 2) {
    return weekdayShort(sorted[0] ?? 1) + '–' + weekdayShort(sorted[sorted.length - 1] ?? 7)
  }
  return sorted.map(day => weekdayShort(day)).join(', ')
}

export function personInitials(person: { firstName: string, lastName: string }): string {
  return (person.firstName.charAt(0) + person.lastName.charAt(0)).toUpperCase()
}
