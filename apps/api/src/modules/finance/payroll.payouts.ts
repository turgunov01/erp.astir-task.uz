import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { badRequest, notFound } from '../../lib/errors'
import { t } from '../../i18n'
import { summary, type PayrollScope } from './payroll.service'

/**
 * Paying a month out: «Выплатить» on a row of the calculation.
 *
 * A payout hands over what is left to pay for one employee's month in one
 * currency, keeps the figures it was worked out from, and marks the approved
 * entries it settles as paid. What changes afterwards (a late fine approved,
 * another hour worked) shows up as a new amount left to pay, settled by a
 * second payout, so nothing paid is ever rewritten.
 */

const cents = (value: number) => Math.round(value * 100) / 100

export const notFoundPayout = () => notFound('Payroll payout')

export const payoutInclude = {
  employee: { select: { id: true, position: true, user: { select: { firstName: true, lastName: true } } } },
  paidBy: { select: { id: true, firstName: true, lastName: true } }
} satisfies Prisma.PayrollPayoutInclude

export function listPayouts(period: string, scope: PayrollScope) {
  return prisma.payrollPayout.findMany({
    where: { period, ...(scope.ownEmployeeId ? { employeeId: scope.ownEmployeeId } : {}) },
    include: payoutInclude,
    orderBy: { paidAt: 'desc' }
  })
}

function assertPeriodStarted(period: string) {
  if (period > new Date().toISOString().slice(0, 7)) {
    throw badRequest(t('finance.payroll.payout.futureMonth'))
  }
}

/**
 * Pay one employee's month in one currency: whatever the calculation says is
 * left. Refused while drafts are open (the sum is not settled yet) or when
 * nothing is owed.
 */
export async function payOut(
  period: string,
  employeeId: string,
  currency: string,
  actorId: string | undefined,
  note?: string | null
) {
  assertPeriodStarted(period)
  const month = await summary(period, { ownEmployeeId: null }, employeeId)
  const row = month.rows.find(item => item.employee.id === employeeId && item.currency === currency)
  if (!row) throw badRequest(t('finance.payroll.payout.nothingToPay'))
  if (row.drafts > 0) throw badRequest(t('finance.payroll.payout.draftsOpen', { count: row.drafts }))

  return prisma.$transaction(async tx => {
    // One payout at a time per person and month: a double click pays once.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeId + '|' + period}))`
    const paid = await tx.payrollPayout.aggregate({
      where: { employeeId, period, currency },
      _sum: { amount: true }
    })
    const amount = cents(row.net - Number(paid._sum.amount ?? 0))
    if (amount <= 0) throw badRequest(t('finance.payroll.payout.nothingToPay'))

    const settled = await tx.payrollEntry.findMany({
      where: { employeeId, period, currency, status: 'APPROVED' },
      select: { id: true }
    })
    const now = new Date()
    if (settled.length > 0) {
      await tx.payrollEntry.updateMany({
        where: { id: { in: settled.map(entry => entry.id) } },
        data: { status: 'PAID', paidAt: now }
      })
    }
    return tx.payrollPayout.create({
      data: {
        employeeId,
        period,
        currency,
        amount,
        salary: row.salary,
        earned: row.earned,
        workedMinutes: row.workedMinutes,
        normMinutes: month.month.normMinutes,
        net: row.net,
        entryIds: settled.map(entry => entry.id),
        note: note ?? null,
        paidById: actorId ?? null,
        paidAt: now
      },
      include: payoutInclude
    })
  })
}

export interface PayAllResult {
  paid: Awaited<ReturnType<typeof payOut>>[]
  skipped: { employeeId: string, name: string, currency: string, reason: string }[]
}

/** «Выплатить всем»: every row with something left and no open drafts. */
export async function payAll(period: string, actorId: string | undefined): Promise<PayAllResult> {
  assertPeriodStarted(period)
  const month = await summary(period, { ownEmployeeId: null })
  const result: PayAllResult = { paid: [], skipped: [] }
  for (const row of month.rows) {
    if (row.remaining <= 0) continue
    if (row.drafts > 0) {
      result.skipped.push({
        employeeId: row.employee.id,
        name: row.employee.name,
        currency: row.currency,
        reason: t('finance.payroll.payout.draftsOpen', { count: row.drafts })
      })
      continue
    }
    result.paid.push(await payOut(period, row.employee.id, row.currency, actorId))
  }
  return result
}

/**
 * Undo a payout recorded by mistake: the entries it settled go back to
 * approved (unless someone has moved them since) and the amount is owed again.
 */
export async function undoPayout(id: string) {
  return prisma.$transaction(async tx => {
    const payout = await tx.payrollPayout.findUnique({ where: { id }, include: payoutInclude })
    if (!payout) throw notFoundPayout()
    if (payout.entryIds.length > 0) {
      await tx.payrollEntry.updateMany({
        where: { id: { in: payout.entryIds }, status: 'PAID' },
        data: { status: 'APPROVED', paidAt: null }
      })
    }
    await tx.payrollPayout.delete({ where: { id } })
    return payout
  })
}
