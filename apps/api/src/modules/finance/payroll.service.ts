import { Prisma } from '@prisma/client'
import type {
  PayrollEntrySource,
  PayrollEntryStatus,
  PayrollEntryType
} from '@prisma/client'
import { PERMISSION, type Role } from '@astir/types'
import { prisma } from '../../lib/prisma'
import { hasPermission } from '../../lib/rbac'
import { studioSettings } from '../../lib/settings'
import { badRequest, conflict, notFound, unauthenticated } from '../../lib/errors'
import { t, type MessageKey } from '../../i18n'

/**
 * Employee pay adjustments (client item 7): advances, penalties incl.
 * lateness, bonuses, deductions — and the monthly roll-up they feed.
 *
 * Entries are typed in by hand today. The write path below is the one an
 * attendance integration (Verifix or similar) will call too, passing
 * `source: EXTERNAL` and its own record id, so a re-sent record collides with
 * the unique (source, externalId) index instead of fining someone twice.
 */

/** Statuses that count towards the month's totals. */
const COUNTED_STATUSES: readonly PayrollEntryStatus[] = ['APPROVED', 'PAID']

/**
 * Where an entry may go from where it is.
 *
 * Paid can step back to approved (marked paid by mistake) but not further: a
 * payout that happened is undone by a new entry, not by rewriting this one.
 */
const TRANSITIONS: Readonly<Record<PayrollEntryStatus, readonly PayrollEntryStatus[]>> = {
  DRAFT: ['APPROVED', 'CANCELLED'],
  APPROVED: ['PAID', 'DRAFT', 'CANCELLED'],
  PAID: ['APPROVED'],
  CANCELLED: ['DRAFT']
}

/** An entry status as it reads inside a sentence, in the request's language. */
const statusLabel = (status: PayrollEntryStatus) =>
  t(('finance.payroll.status.' + status) as MessageKey)

/** Matches nothing, for a caller who has no employment record. */
const NO_EMPLOYEE = '00000000-0000-4000-8000-000000000000'

export const entryInclude = {
  employee: {
    select: {
      id: true,
      position: true,
      user: { select: { id: true, firstName: true, lastName: true } }
    }
  },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } }
} satisfies Prisma.PayrollEntryInclude

export interface PayrollScope {
  /** Set when the caller may only see their own entries. */
  ownEmployeeId: string | null
}

/**
 * Whose entries the caller may read.
 *
 * payroll:view sees everyone; payroll:view:own alone narrows every query to
 * the caller's own employment record, and hides drafts — a draft is somebody
 * still deciding, not a fine yet.
 */
export async function scopeFor(user: { id: string, role: Role } | undefined): Promise<PayrollScope> {
  if (!user) throw unauthenticated()
  if (await hasPermission(user.role, PERMISSION.PAYROLL_VIEW)) return { ownEmployeeId: null }
  const own = await prisma.employee.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: { id: true }
  })
  return { ownEmployeeId: own?.id ?? NO_EMPLOYEE }
}

/** YYYY-MM of a date string, the period an entry falls in by default. */
export function periodOf(date: string | Date): string {
  return new Date(date).toISOString().slice(0, 7)
}

export interface ListFilters {
  employeeId?: string
  type?: PayrollEntryType
  status?: PayrollEntryStatus
  source?: PayrollEntrySource
  period?: string
}

export function listWhere(filters: ListFilters, scope: PayrollScope): Prisma.PayrollEntryWhereInput {
  const where: Prisma.PayrollEntryWhereInput = {}
  if (filters.employeeId) where.employeeId = filters.employeeId
  if (filters.type) where.type = filters.type
  if (filters.status) where.status = filters.status
  if (filters.source) where.source = filters.source
  if (filters.period) where.period = filters.period
  if (scope.ownEmployeeId) {
    // Narrowed rather than refused, the way timesheets behave: a request for
    // someone else simply comes back with the caller's own rows.
    where.employeeId = scope.ownEmployeeId
    where.status = filters.status && filters.status !== 'DRAFT'
      ? filters.status
      : { not: 'DRAFT' }
  }
  return where
}

export function list(where: Prisma.PayrollEntryWhereInput, skip: number, take: number) {
  return prisma.$transaction([
    prisma.payrollEntry.findMany({
      where,
      include: entryInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip,
      take
    }),
    prisma.payrollEntry.count({ where })
  ])
}

export const notFoundEntry = () => notFound('Payroll entry')

export async function getById(id: string) {
  const entry = await prisma.payrollEntry.findUnique({ where: { id }, include: entryInclude })
  if (!entry) throw notFoundEntry()
  return entry
}

async function assertEmployee(employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: { id: true }
  })
  if (!employee) throw badRequest(t('finance.payroll.employeeMissing'))
}

function assertLateness(type: PayrollEntryType, lateMinutes: number | null | undefined) {
  if (type === 'LATENESS' && !lateMinutes) {
    throw badRequest(t('finance.payroll.latenessMinutesRequired'))
  }
}

export interface CreateInput {
  employeeId: string
  type: PayrollEntryType
  amount: number
  currency?: string
  date: string
  period?: string
  lateMinutes?: number | null
  reason?: string | null
  source?: PayrollEntrySource
  externalId?: string | null
}

export async function create(input: CreateInput, actorId: string | undefined) {
  await assertEmployee(input.employeeId)
  assertLateness(input.type, input.lateMinutes)
  const currency = input.currency ?? (await studioSettings()).currency
  try {
    return await prisma.payrollEntry.create({
      data: {
        employeeId: input.employeeId,
        type: input.type,
        amount: input.amount,
        currency,
        date: new Date(input.date),
        period: input.period ?? periodOf(input.date),
        // Minutes only mean something on a lateness entry.
        lateMinutes: input.type === 'LATENESS' ? input.lateMinutes ?? null : null,
        reason: input.reason ?? null,
        source: input.source ?? 'MANUAL',
        externalId: input.externalId ?? null,
        createdById: actorId ?? null
      },
      include: entryInclude
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict(t('finance.payroll.externalIdTaken'))
    }
    throw err
  }
}

export type UpdateInput = Partial<Omit<CreateInput, 'source' | 'externalId'>>

/**
 * Edit an entry's content.
 *
 * Only drafts: an approved amount is what somebody signed off, and changing it
 * underneath them would make the approval mean nothing. Step it back to a
 * draft first, which the history then shows.
 */
export async function update(id: string, input: UpdateInput) {
  const existing = await getById(id)
  if (existing.status !== 'DRAFT') {
    throw badRequest(t('finance.payroll.onlyDraftEditable', { status: statusLabel(existing.status) }))
  }
  if (input.employeeId) await assertEmployee(input.employeeId)
  const type = input.type ?? existing.type
  const lateMinutes = input.lateMinutes === undefined ? existing.lateMinutes : input.lateMinutes
  assertLateness(type, lateMinutes)

  const data: Prisma.PayrollEntryUncheckedUpdateInput = {
    lateMinutes: type === 'LATENESS' ? lateMinutes : null
  }
  if (input.employeeId !== undefined) data.employeeId = input.employeeId
  if (input.type !== undefined) data.type = input.type
  if (input.amount !== undefined) data.amount = input.amount
  if (input.currency !== undefined) data.currency = input.currency
  if (input.reason !== undefined) data.reason = input.reason
  if (input.date !== undefined) data.date = new Date(input.date)
  // A moved date drags the period along unless the caller set one explicitly.
  if (input.period !== undefined) data.period = input.period
  else if (input.date !== undefined) data.period = periodOf(input.date)

  return prisma.payrollEntry.update({ where: { id }, data, include: entryInclude })
}

export async function setStatus(id: string, status: PayrollEntryStatus, actorId: string | undefined) {
  const existing = await getById(id)
  if (existing.status === status) return { entry: existing, from: status }
  if (!TRANSITIONS[existing.status].includes(status)) {
    throw badRequest(t('finance.payroll.transitionNotAllowed', {
      from: statusLabel(existing.status),
      to: statusLabel(status)
    }))
  }
  const now = new Date()
  const data: Prisma.PayrollEntryUncheckedUpdateInput = { status }
  if (status === 'APPROVED' && existing.status === 'DRAFT') {
    data.approvedById = actorId ?? null
    data.approvedAt = now
  }
  if (status === 'DRAFT') {
    data.approvedById = null
    data.approvedAt = null
  }
  data.paidAt = status === 'PAID' ? now : null

  const entry = await prisma.payrollEntry.update({ where: { id }, data, include: entryInclude })
  return { entry, from: existing.status }
}

/** Only drafts and cancelled entries go: anything approved stays on record. */
export async function remove(id: string) {
  const existing = await getById(id)
  if (existing.status !== 'DRAFT' && existing.status !== 'CANCELLED') {
    throw badRequest(t('finance.payroll.deleteOnlyDraft'))
  }
  await prisma.payrollEntry.delete({ where: { id } })
  return existing
}

/**
 * Set or clear an employee's base monthly salary.
 *
 * A null amount removes it: "no salary on file" and "salary of zero" are
 * different answers, and the summary shows them differently.
 */
export async function setSalary(
  employeeId: string,
  amount: number | null,
  currency: string | undefined,
  actorId: string | undefined
) {
  await assertEmployee(employeeId)
  if (amount === null) {
    await prisma.employeeSalary.deleteMany({ where: { employeeId } })
    return null
  }
  const code = currency ?? (await studioSettings()).currency
  return prisma.employeeSalary.upsert({
    where: { employeeId },
    create: { employeeId, amount, currency: code, updatedById: actorId ?? null },
    update: { amount, currency: code, updatedById: actorId ?? null }
  })
}

export interface SummaryRow {
  employee: { id: string, name: string, position: string }
  currency: string
  salary: number | null
  bonuses: number
  otherAccruals: number
  advances: number
  penalties: number
  lateness: number
  lateMinutes: number
  latenessCount: number
  deductions: number
  accrued: number
  withheld: number
  net: number
  drafts: number
}

type Totals = Omit<SummaryRow, 'employee' | 'salary' | 'drafts'> & { salary: number, drafts: number }

function emptyRow(employee: SummaryRow['employee'], currency: string): SummaryRow {
  return {
    employee, currency, salary: null,
    bonuses: 0, otherAccruals: 0, advances: 0, penalties: 0, lateness: 0,
    lateMinutes: 0, latenessCount: 0, deductions: 0,
    accrued: 0, withheld: 0, net: 0, drafts: 0
  }
}

const AMOUNT_FIELD: Readonly<Record<PayrollEntryType, keyof SummaryRow>> = {
  ADVANCE: 'advances',
  BONUS: 'bonuses',
  PENALTY: 'penalties',
  LATENESS: 'lateness',
  DEDUCTION: 'deductions',
  OTHER_ACCRUAL: 'otherAccruals'
}

/** Two decimals, so float drift from the sums never reaches the screen. */
const cents = (value: number) => Math.round(value * 100) / 100

/**
 * One month per employee and currency: base salary, what was added, what was
 * withheld, and what is left to pay.
 *
 * Only approved and paid entries count; drafts are reported as a number so a
 * month with unapproved penalties does not look settled. Rows split by
 * currency because adding som to dollars would produce a number nobody is owed.
 */
export async function summary(period: string, scope: PayrollScope, employeeId?: string) {
  const employeeFilter = scope.ownEmployeeId ?? employeeId
  const entryWhere: Prisma.PayrollEntryWhereInput = {
    period,
    status: { in: scope.ownEmployeeId ? [...COUNTED_STATUSES] : [...COUNTED_STATUSES, 'DRAFT'] },
    ...(employeeFilter ? { employeeId: employeeFilter } : {})
  }

  const [entries, salaries] = await Promise.all([
    prisma.payrollEntry.findMany({
      where: entryWhere,
      select: {
        employeeId: true, type: true, status: true, amount: true,
        currency: true, lateMinutes: true
      }
    }),
    prisma.employeeSalary.findMany({
      where: {
        employee: { deletedAt: null },
        ...(employeeFilter ? { employeeId: employeeFilter } : {})
      },
      select: { employeeId: true, amount: true, currency: true }
    })
  ])

  const employeeIds = [...new Set([
    ...entries.map(entry => entry.employeeId),
    ...salaries.map(salary => salary.employeeId)
  ])]
  /*
   * Everyone still working is listed even with nothing on file, so a salary
   * can be set from this table and a person with no fines is visibly at zero
   * rather than missing.
   */
  const [employees, settings] = await Promise.all([
    prisma.employee.findMany({
      where: {
        OR: [
          { id: { in: employeeIds } },
          {
            deletedAt: null,
            status: { not: 'INACTIVE' },
            ...(employeeFilter ? { id: employeeFilter } : {})
          }
        ]
      },
      select: { id: true, position: true, user: { select: { firstName: true, lastName: true } } }
    }),
    studioSettings()
  ])
  const people = new Map(employees.map(employee => [employee.id, {
    id: employee.id,
    name: employee.user.firstName + ' ' + employee.user.lastName,
    position: employee.position
  }]))

  const rows = new Map<string, SummaryRow>()
  const rowFor = (id: string, currency: string) => {
    const key = id + '|' + currency
    let row = rows.get(key)
    if (!row) {
      row = emptyRow(people.get(id) ?? { id, name: '—', position: '' }, currency)
      rows.set(key, row)
    }
    return row
  }

  for (const salary of salaries) {
    rowFor(salary.employeeId, salary.currency).salary = Number(salary.amount)
  }

  for (const entry of entries) {
    const row = rowFor(entry.employeeId, entry.currency)
    if (entry.status === 'DRAFT') {
      row.drafts += 1
      continue
    }
    const amount = Number(entry.amount)
    const field = AMOUNT_FIELD[entry.type]
    ;(row[field] as number) += amount
    if (entry.type === 'LATENESS') {
      row.lateMinutes += entry.lateMinutes ?? 0
      row.latenessCount += 1
    }
  }

  const listed = new Set([...rows.values()].map(row => row.employee.id))
  for (const person of people.values()) {
    if (!listed.has(person.id)) rowFor(person.id, settings.currency)
  }

  const result = [...rows.values()].map(row => {
    const accrued = (row.salary ?? 0) + row.bonuses + row.otherAccruals
    const withheld = row.penalties + row.lateness + row.deductions
    return {
      ...row,
      accrued: cents(accrued),
      withheld: cents(withheld),
      net: cents(accrued - withheld - row.advances)
    }
  }).sort((a, b) => a.employee.name.localeCompare(b.employee.name, 'ru') || a.currency.localeCompare(b.currency))

  const totals = new Map<string, Totals>()
  for (const row of result) {
    const total = totals.get(row.currency) ?? {
      currency: row.currency, salary: 0, bonuses: 0, otherAccruals: 0, advances: 0,
      penalties: 0, lateness: 0, lateMinutes: 0, latenessCount: 0, deductions: 0,
      accrued: 0, withheld: 0, net: 0, drafts: 0
    }
    total.salary += row.salary ?? 0
    for (const key of [
      'bonuses', 'otherAccruals', 'advances', 'penalties', 'lateness', 'lateMinutes',
      'latenessCount', 'deductions', 'accrued', 'withheld', 'net', 'drafts'
    ] as const) {
      total[key] += row[key]
    }
    totals.set(row.currency, total)
  }

  return {
    period,
    rows: result,
    totals: [...totals.values()].map(total => ({
      ...total,
      salary: cents(total.salary),
      accrued: cents(total.accrued),
      withheld: cents(total.withheld),
      net: cents(total.net)
    }))
  }
}
