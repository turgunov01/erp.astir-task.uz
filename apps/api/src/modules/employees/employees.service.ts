import type { CreateEmployeeInput } from '@astir/validation'
import { prisma } from '../../lib/prisma'
import { conflict, notFound } from '../../lib/errors'
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
 * Deactivate rather than delete: timesheets, versions and activity entries all
 * reference this person and must stay attributable.
 */
export async function deactivate(id: string) {
  const employee = await getById(id)
  return prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: employee.userId }, data: { isActive: false } })
    await tx.refreshToken.updateMany({
      where: { userId: employee.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
    return tx.employee.update({
      where: { id },
      data: { status: 'INACTIVE', deletedAt: new Date() }
    })
  })
}
