import type { CreateEmployeeInput } from '@astir/validation'
import { prisma } from '../../lib/prisma'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import { hashPassword } from '../auth/auth.service'
import * as repo from './employees.repository'
import { issueLoginCode } from '../../lib/otp'

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
    throw conflict('A user with email ' + input.email + ' already exists')
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
    data: { emailVerifiedAt: new Date(), isActive: true }
  })
  return getById(id)
}

export async function update(id: string, input: Record<string, unknown>) {
  const employee = await getById(id)

  const userFields = ['firstName', 'lastName', 'role', 'isActive'] as const
  const userData: Record<string, unknown> = {}
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

  return prisma.$transaction(async tx => {
    if (Object.keys(userData).length > 0) {
      await tx.user.update({ where: { id: employee.userId }, data: userData })
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
    throw badRequest('Нельзя удалить собственную учётную запись')
  }

  const work = await prisma.user.findUniqueOrThrow({
    where: { id: employee.userId },
    select: {
      email: true,
      _count: { select: { comments: true } },
      employee: { select: { _count: { select: { timesheetEntries: true } } } }
    }
  })
  const hasOwnWork =
    work._count.comments > 0 || (work.employee?._count.timesheetEntries ?? 0) > 0

  if (!hasOwnWork) {
    await prisma.user.delete({ where: { id: employee.userId } })
    return { erased: true }
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.user.update({
      where: { id: employee.userId },
      data: {
        isActive: false,
        deletedAt: now,
        email: work.email + '.deleted.' + now.getTime()
      }
    }),
    prisma.refreshToken.updateMany({
      where: { userId: employee.userId, revokedAt: null },
      data: { revokedAt: now }
    }),
    prisma.employee.update({
      where: { id },
      data: { status: 'INACTIVE', deletedAt: now }
    })
  ])
  return { erased: false }
}
