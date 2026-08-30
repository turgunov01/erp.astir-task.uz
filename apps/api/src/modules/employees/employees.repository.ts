import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

export interface EmployeeListParams {
  skip: number
  take: number
  search?: string
  departmentId?: string
  status?: string
  role?: string
  sort: string
  order: 'asc' | 'desc'
}

const SORTABLE = new Set(['position', 'createdAt', 'status'])

export function buildWhere(params: Partial<EmployeeListParams>): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = { deletedAt: null }
  if (params.departmentId) where.departmentId = params.departmentId
  if (params.status) where.status = params.status as Prisma.EmployeeWhereInput['status']
  if (params.role) where.user = { role: params.role as never }
  if (params.search) {
    where.OR = [
      { position: { contains: params.search, mode: 'insensitive' } },
      { user: { firstName: { contains: params.search, mode: 'insensitive' } } },
      { user: { lastName: { contains: params.search, mode: 'insensitive' } } },
      { user: { email: { contains: params.search, mode: 'insensitive' } } }
    ]
  }
  return where
}

const INCLUDE = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      avatarUrl: true,
      isActive: true,
      lastLoginAt: true
    }
  },
  department: { select: { id: true, name: true } }
} satisfies Prisma.EmployeeInclude

export function findMany(params: EmployeeListParams) {
  const orderField = SORTABLE.has(params.sort) ? params.sort : 'createdAt'
  return prisma.employee.findMany({
    where: buildWhere(params),
    skip: params.skip,
    take: params.take,
    orderBy: { [orderField]: params.order },
    include: INCLUDE
  })
}

export function count(params: Partial<EmployeeListParams>) {
  return prisma.employee.count({ where: buildWhere(params) })
}

export function findById(id: string) {
  return prisma.employee.findFirst({
    where: { id, deletedAt: null },
    include: INCLUDE
  })
}

export function findByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } })
}

export function softDelete(id: string) {
  return prisma.employee.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'INACTIVE' }
  })
}

/** Assigned hours in the current week, for the workload view (spec 32). */
export function assignedHours(employeeUserId: string, from: Date, to: Date) {
  return prisma.task.aggregate({
    where: {
      assigneeId: employeeUserId,
      deletedAt: null,
      status: { notIn: ['DONE', 'APPROVED'] },
      deadline: { gte: from, lte: to }
    },
    _sum: { estimatedHours: true }
  })
}
