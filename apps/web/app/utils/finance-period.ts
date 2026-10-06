/**
 * Reporting periods for the finance pages, as they travel in the URL.
 *
 * One query key, `period`, says which span is meant: `2026-10` is a month,
 * `2026-Q4` a quarter, `2026` a year, `custom` reads `from`/`to`, and `all`
 * (lists only) means no date filter. A link to "October" therefore stays
 * October, instead of "whatever month it is when the link is opened".
 */

export type PeriodKind = 'month' | 'quarter' | 'year' | 'custom' | 'all'

export interface ResolvedPeriod {
  kind: PeriodKind
  /** The `period` query value. */
  key: string
  /** Inclusive day bounds as YYYY-MM-DD; empty for `all`. */
  from: string
  to: string
  label: string
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Last day of a month, month 1-12. */
function lastDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

export function monthKey(date = new Date()) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1)
}

export function kindOf(key: string): PeriodKind | null {
  if (key === 'all') return 'all'
  if (key === 'custom') return 'custom'
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return 'month'
  if (/^\d{4}-Q[1-4]$/.test(key)) return 'quarter'
  if (/^\d{4}$/.test(key)) return 'year'
  return null
}

/** Turn query values into concrete bounds; anything unreadable falls back. */
export function resolvePeriod(
  key: unknown,
  from: unknown,
  to: unknown,
  fallback: string
): ResolvedPeriod {
  const raw = typeof key === 'string' ? key : ''
  const kind = kindOf(raw)

  if (kind === 'all') return { kind, key: 'all', from: '', to: '', label: 'За всё время' }

  if (kind === 'custom') {
    const start = isDay(from) ? from : ''
    const end = isDay(to) ? to : ''
    if (start || end) {
      const [a, b] = start && end && start > end ? [end, start] : [start, end]
      return { kind, key: 'custom', from: a, to: b, label: describeRange(a, b) }
    }
  }

  if (kind === 'month') {
    const [year, month] = raw.split('-').map(Number) as [number, number]
    return {
      kind, key: raw,
      from: raw + '-01',
      to: raw + '-' + pad(lastDay(year, month)),
      label: MONTH_NAMES[month - 1] + ' ' + year
    }
  }

  if (kind === 'quarter') {
    const year = Number(raw.slice(0, 4))
    const quarter = Number(raw.slice(-1))
    const first = (quarter - 1) * 3 + 1
    const last = first + 2
    return {
      kind, key: raw,
      from: year + '-' + pad(first) + '-01',
      to: year + '-' + pad(last) + '-' + pad(lastDay(year, last)),
      label: quarter + ' квартал ' + year
    }
  }

  if (kind === 'year') {
    return { kind, key: raw, from: raw + '-01-01', to: raw + '-12-31', label: raw + ' год' }
  }

  return fallback === raw ? resolvePeriod('all', '', '', 'all') : resolvePeriod(fallback, from, to, fallback)
}

function describeRange(from: string, to: string) {
  const day = (value: string) => new Date(value + 'T00:00:00').toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
  if (from && to) return day(from) + ' — ' + day(to)
  if (from) return 'с ' + day(from)
  return 'по ' + day(to)
}

/** The same kind of period one step earlier or later. */
export function shiftPeriod(key: string, step: -1 | 1): string {
  const kind = kindOf(key)
  if (kind === 'month') {
    const [year, month] = key.split('-').map(Number) as [number, number]
    const date = new Date(Date.UTC(year, month - 1 + step, 1))
    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1)
  }
  if (kind === 'quarter') {
    const index = Number(key.slice(0, 4)) * 4 + Number(key.slice(-1)) - 1 + step
    return Math.floor(index / 4) + '-Q' + ((index % 4) + 1)
  }
  if (kind === 'year') return String(Number(key) + step)
  return key
}

/** The month, quarter or year containing today, as a `period` key. */
export function currentKey(kind: 'month' | 'quarter' | 'year', now = new Date()) {
  if (kind === 'month') return monthKey(now)
  if (kind === 'quarter') return now.getFullYear() + '-Q' + (Math.floor(now.getMonth() / 3) + 1)
  return String(now.getFullYear())
}

/** "окт. 2026" for a YYYY-MM chart axis. */
export function shortMonth(month: string) {
  const [year, index] = month.split('-').map(Number) as [number, number]
  return new Date(year, index - 1, 1).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })
}
