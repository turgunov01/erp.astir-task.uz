import type { CreateEmployeeInput } from '@astir/validation'
import { prisma } from '../../lib/prisma'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import { hashPassword } from '../auth/auth.service'
import * as repo from './employees.repository'
import { issueLoginCode } from '../../lib/otp'
import { t } from '../../i18n'

export async function list(query: Parameters<typeof repo.findMany>[0] & {
  page: number
  limit: number
}) {
  const { skip, take } = toSkipTake(query.page, query.limit)
  const [items, total] = await Promise.all([
    repo.findMany({ ...query, skip, take }),
    repo.count(query)
  ])
  return { items, meta: buildMeta(total, query.page, query.limit) }
}

export async function getById(id: string) {
  const employee = await repo.findById(id)
  if (!employee) throw notFound('Employee')
  return employee
}

/**
 * Provision the login and the employee record together.
 *
 * Both rows are written in one transaction: a User without an Employee would
 * be a login that cannot be scheduled, and an Employee without a User cannot
 * sign in at all.
 */
export async function create(input: CreateEmployeeInput) {
  if (await repo.findByEmail(input.email)) {
    throw conflict(t('team.employees.emailTaken', { email: input.email }))
  }

  if (input.departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: input.departmentId },
      select: { id: true }
    })
    if (!department) throw notFound('Department')
  }

  const passwordHash = await hashPassword(input.password)

  /*
   * The account is active from the start, so the employee genuinely has access;
   * what is missing is proof of the address, which the first login asks for.
   */
  const created = await prisma.$transaction(async tx => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role
      }
    })

    return tx.employee.create({
      data: {
        userId: user.id,
        departmentId: input.departmentId ?? null,
        position: input.position,
        employmentType: input.employmentType,
        hourlyRate: input.hourlyRate ?? null,
        weeklyCapacityHours: input.weeklyCapacityHours,
        status: input.status
      },
      include: {
        user: {
          select: {
            id: true, email: true, firstName: true, lastName: true,
            role: true, avatarUrl: true, isActive: true, lastLoginAt: true
          }
        },
        department: { select: { id: true, name: true } }
      }
    })
  })

  // Sending is best effort: a mail outage must not undo a created employee.
  await issueLoginCode({
    id: created.userId,
    email: created.user.email,
    firstName: created.user.firstName
  }).catch(() => undefined)

  return created
}

/**
 * Confirm an address on the employee`s behalf.
 *
 * The escape hatch for a studio without working mail: somebody who can already
 * manage the team vouches for the address instead of the code doing it.
 */
export async function verifyEmail(id: string) {
  const employee = await getById(id)
  await prisma.user.update({
    where: { id: employee.userId },
    // Vouched for by hand: the "address was changed" step has nothing left to ask.
    data: { emailVerifiedAt: new Date(), emailChangedAt: null, isActive: true }
  })
  return getById(id)
}

/** What an edit did to the login itself, so the caller can audit and notify. */
export interface LoginChanges {
  /** The address the login moved away from, when it moved. */
  previousEmail: string | null
  passwordSet: boolean
}

/**
 * The login part of an edit: a new address and a password set by the manager.
 *
 * A new address is unproven, so it goes back through the first-login code; a
 * password somebody else chose must be replaced by the person at once. Either
 * way every open session ends, so whoever held the old credentials is out.
 * Your own login is not changed from here: a slip would lock you out, and the
 * profile already has a password form that asks for the current one.
 */
/**
 * Who may take over whose login. Setting someone's address and password is
 * the same as holding their account, so a manager may do it only to people
 * who do not outrank them: a project manager resets an artist, never the
 * administrator or the owner.
 */
const LOGIN_RANK: Partial<Record<string, number>> = { OWNER: 3, ADMIN: 2 }
const loginRank = (role: string | undefined) => LOGIN_RANK[role ?? ''] ?? 1

/** The person making the change, as the controller knows them. */
export interface Actor {
  id?: string
  role?: string
}

async function loginChanges(
  employee: { userId: string, user: { email: string, role: string } },
  input: Record<string, unknown>,
  actor: Actor
) {
  const email = typeof input.email === 'string' ? input.email : undefined
  const emailChanges = email !== undefined && email !== employee.user.email
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : undefined

  if ((emailChanges || newPassword) && employee.userId === actor.id) {
    throw badRequest(t('team.employees.ownLoginHere'))
  }
  if ((emailChanges || newPassword) && loginRank(actor.role) < loginRank(employee.user.role)) {
    throw badRequest(t('team.employees.loginOutranked'))
  }
  if (emailChanges && await repo.findByEmail(email)) {
    throw conflict(t('team.employees.emailTaken', { email }))
  }

  const now = new Date()
  const data: Record<string, unknown> = {}
  if (emailChanges) {
    Object.assign(data, { email, emailVerifiedAt: null, emailChangedAt: now })
  }
  if (newPassword) {
    Object.assign(data, { passwordHash: await hashPassword(newPassword), mustChangePassword: true })
  }
  if (emailChanges || newPassword) data.sessionsRevokedAt = now

  return {
    data,
    revokeSessions: Boolean(emailChanges || newPassword),
    changes: {
      previousEmail: emailChanges ? employee.user.email : null,
      passwordSet: Boolean(newPassword)
    } satisfies LoginChanges
  }
}

export async function update(id: string, input: Record<string, unknown>, actor: Actor = {}) {
  const employee = await getById(id)
  const login = await loginChanges(employee, input, actor)

  const userFields = ['firstName', 'lastName', 'role', 'isActive'] as const
  const userData: Record<string, unknown> = { ...login.data }
  for (const field of userFields) {
    if (field in input) userData[field] = input[field]
  }

  const employeeFields = [
    'departmentId', 'position', 'employmentType',
    'hourlyRate', 'weeklyCapacityHours', 'status'
  ] as const
  const employeeData: Record<string, unknown> = {}
  for (const field of employeeFields) {
    if (field in input) employeeData[field] = input[field]
  }

  const updated = await prisma.$transaction(async tx => {
    if (Object.keys(userData).length > 0) {
      await tx.user.update({ where: { id: employee.userId }, data: userData })
    }
    if (login.revokeSessions) {
      await tx.refreshToken.updateMany({
        where: { userId: employee.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      })
      // A code mailed to the old address must not prove the new one.
      await tx.emailCode.deleteMany({ where: { userId: employee.userId, consumedAt: null } })
    }
    return tx.employee.update({
      where: { id },
      data: employeeData,
      include: {
        user: {
          select: {
            id: true, email: true, firstName: true, lastName: true,
            role: true, avatarUrl: true, isActive: true, lastLoginAt: true
          }
        },
        department: { select: { id: true, name: true } }
      }
    })
  })

  return { employee: updated, login: login.changes }
}

/**
 * Delete an employee together with the login.
 *
 * The schema is built for the account to go: sessions, codes, notifications
 * and project memberships cascade, while tasks, versions and reviews keep
 * their rows and only drop the reference. Two cascades are different —
 * timesheet entries and comments are the person's own work — so an employee
 * who has any is kept as a soft-deleted row instead and merely loses access.
 *
 * Either way the address is released. The email column is unique, and a
 * studio that removes a test account expects to create it again with the same
 * one; a retained row gets a tombstone address that can no longer be logged
 * in with or collide.
 */
export async function remove(id: string, actorId: string | undefined) {
  const employee = await getById(id)
  if (employee.userId === actorId) {
    throw badRequest(t('team.employees.cannotDeleteSelf'))
  }

  return prisma.$transaction(async tx => {
    /*
     * Decide and act under one lock. A comment or timesheet entry references
     * these rows, so FOR UPDATE also holds back any insert that lands between
     * the count and the delete — without it the cascade could take work the
     * count never saw.
     */
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${employee.userId}::uuid FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM employees WHERE id = ${id}::uuid FOR UPDATE`

    const work = await tx.user.findUniqueOrThrow({
      where: { id: employee.userId },
      select: {
        email: true,
        // Comments are soft-deleted one by one; those no longer count as work.
        _count: { select: { comments: { where: { deletedAt: null } } } },
        // Payroll entries are money paid or withheld: erasing them with the
        // login would rewrite past months, so they keep the row like work does.
        employee: { select: { _count: { select: { timesheetEntries: true, payrollEntries: true } } } }
      }
    })
    const hasOwnWork =
      work._count.comments > 0 ||
      (work.employee?._count.timesheetEntries ?? 0) > 0 ||
      (work.employee?._count.payrollEntries ?? 0) > 0

    if (!hasOwnWork) {
      await tx.user.delete({ where: { id: employee.userId } })
      return { erased: true }
    }

    const now = new Date()
    await tx.user.update({
      where: { id: employee.userId },
      data: {
        isActive: false,
        deletedAt: now,
        email: work.email + '.deleted.' + now.getTime()
      }
    })
    await tx.refreshToken.updateMany({
      where: { userId: employee.userId, revokedAt: null },
      data: { revokedAt: now }
    })
    await tx.employee.update({
      where: { id },
      data: { status: 'INACTIVE', deletedAt: now }
    })
    return { erased: false }
  })
}
