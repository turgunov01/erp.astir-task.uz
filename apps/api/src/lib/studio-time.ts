/**
 * Wall-clock arithmetic in the studio's time zone.
 *
 * Attendance is about local days and local clock times ("came in at 09:12
 * on Tuesday"), while the database stores instants. Node ships full ICU, so
 * Intl does the zone maths and no date library is needed.
 */

export const DEFAULT_TIMEZONE = 'Asia/Tashkent'

const formatters = new Map<string, Intl.DateTimeFormat>()

/** A zone Intl accepts; anything else falls back to the studio default. */
export function safeTimeZone(zone: string | null | undefined): string {
  if (!zone) return DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    return DEFAULT_TIMEZONE
  }
}

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    formatters.set(zone, formatter)
  }
  return formatter
}

export interface LocalParts {
  /** YYYY-MM-DD */
  date: string
  /** Minutes since local midnight. */
  minutes: number
  /** ISO weekday: 1 = Monday ... 7 = Sunday. */
  weekday: number
}

function rawParts(instant: Date, zone: string) {
  const parts: Record<string, string> = {}
  for (const part of formatterFor(zone).formatToParts(instant)) parts[part.type] = part.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  }
}

/** ISO weekday of a YYYY-MM-DD calendar date, independent of any zone. */
export function weekdayOf(date: string): number {
  const day = new Date(date + 'T00:00:00Z').getUTCDay()
  return day === 0 ? 7 : day
}

/** The local calendar date, clock time and weekday of an instant. */
export function localParts(instant: Date, zone: string): LocalParts {
  const p = rawParts(instant, zone)
  const date = String(p.year).padStart(4, '0') + '-' +
    String(p.month).padStart(2, '0') + '-' +
    String(p.day).padStart(2, '0')
  return { date, minutes: p.hour * 60 + p.minute, weekday: weekdayOf(date) }
}

/** Offset of the zone from UTC at an instant, in milliseconds. */
function offsetAt(instant: Date, zone: string): number {
  const p = rawParts(instant, zone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * The instant at which the local clock in `zone` shows `minutes` past
 * midnight on `date`. Two passes settle the offset across a DST change.
 */
export function instantAt(date: string, minutes: number, zone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const wall = Date.UTC(year, month - 1, day, 0, minutes)
  let guess = wall - offsetAt(new Date(wall), zone)
  guess = wall - offsetAt(new Date(guess), zone)
  return new Date(guess)
}

/** "09:30" -> 570. Returns null for anything that is not HH:MM. */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/** A Date for a calendar day as Prisma stores @db.Date (UTC midnight). */
export function dayValue(date: string): Date {
  return new Date(date + 'T00:00:00.000Z')
}

/** YYYY-MM-DD of a @db.Date value read back from Prisma. */
export function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/** Every calendar day from `from` to `to`, both included. */
export function daysInRange(from: string, to: string): string[] {
  const days: string[] = []
  const end = dayValue(to).getTime()
  for (let cursor = dayValue(from).getTime(); cursor <= end; cursor += 86_400_000) {
    days.push(new Date(cursor).toISOString().slice(0, 10))
  }
  return days
}
