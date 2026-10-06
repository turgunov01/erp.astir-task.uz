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
  /** The same period inside a sentence: «12 платежей · октябрь 2026». */
  inline: string
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Last day of a month, month 1-12. */
function lastDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))

/*
 * Month names come from the catalogue, not from Intl: browsers that ship a
 * trimmed ICU (Electron, some Chromium builds) have no Uzbek month names and
 * print «M10» instead. The catalogue writes each name the way it stands inside
 * a sentence — lower case in Russian and Uzbek, capitalised in English and
 * Turkish.
 */

const monthLong = (month: number) => translate('finance.months.long.' + month)
const monthShort = (month: number) => translate('finance.months.short.' + month)
const capitalise = (text: string) => text.charAt(0).toLocaleUpperCase(intlTag()) + text.slice(1)

const parseMonth = (key: string) => key.split('-').map(Number) as [number, number]

/** «Октябрь» / «Oktabr» / «October» / «Ekim»: a month on its own, capitalised. Month 1-12. */
export function monthName(month: number) {
  return capitalise(monthLong(month))
}

/** «Октябрь 2026» for a YYYY-MM key. */
export function monthTitle(key: string) {
  const [year, month] = parseMonth(key)
  return monthName(month) + ' ' + year
}

/** The month inside a sentence: «за октябрь 2026», «for October 2026». */
export function monthInline(key: string) {
  const [year, month] = parseMonth(key)
  return monthLong(month) + ' ' + year
}

/** «окт. 2026» for a YYYY-MM key: a table row label. */
export function monthShortTitle(key: string) {
  const [year, month] = parseMonth(key)
  return monthShort(month) + ' ' + year
}

/** «5 окт. 2026» for a YYYY-MM-DD day. */
function dayLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return day + ' ' + monthShort(month) + ' ' + year
}

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

  if (kind === 'all') {
    return {
      kind, key: 'all', from: '', to: '',
      label: translate('finance.period.all'),
      inline: translate('finance.period.allInline')
    }
  }

  if (kind === 'custom') {
    const start = isDay(from) ? from : ''
    const end = isDay(to) ? to : ''
    if (start || end) {
      const [a, b] = start && end && start > end ? [end, start] : [start, end]
      const label = describeRange(a, b)
      return { kind, key: 'custom', from: a, to: b, label, inline: label }
    }
  }

  if (kind === 'month') {
    const [year, month] = raw.split('-').map(Number) as [number, number]
    return {
      kind, key: raw,
      from: raw + '-01',
      to: raw + '-' + pad(lastDay(year, month)),
      label: monthTitle(raw),
      inline: monthInline(raw)
    }
  }

  if (kind === 'quarter') {
    const year = Number(raw.slice(0, 4))
    const quarter = Number(raw.slice(-1))
    const first = (quarter - 1) * 3 + 1
    const last = first + 2
    const label = translate('finance.period.quarter', { quarter, year })
    return {
      kind, key: raw,
      from: year + '-' + pad(first) + '-01',
      to: year + '-' + pad(last) + '-' + pad(lastDay(year, last)),
      label,
      inline: label
    }
  }

  if (kind === 'year') {
    const label = translate('finance.period.year', { year: raw })
    return { kind, key: raw, from: raw + '-01-01', to: raw + '-12-31', label, inline: label }
  }

  return fallback === raw ? resolvePeriod('all', '', '', 'all') : resolvePeriod(fallback, from, to, fallback)
}

function describeRange(from: string, to: string) {
  if (from && to) return dayLabel(from) + ' — ' + dayLabel(to)
  if (from) return translate('finance.period.since', { day: dayLabel(from) })
  return translate('finance.period.until', { day: dayLabel(to) })
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

/** A whole percentage in the reader's convention: «32 %», «32%», «%32». */
export function formatPercent(value: number) {
  return new Intl.NumberFormat(intlTag(), { style: 'percent', maximumFractionDigits: 0 }).format(value / 100)
}

/** «окт. 26» for a YYYY-MM chart axis. */
export function shortMonth(month: string) {
  const [year, index] = parseMonth(month)
  return monthShort(index) + ' ' + String(year).slice(-2)
}
