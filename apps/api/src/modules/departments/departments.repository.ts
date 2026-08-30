import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

export interface DepartmentListParams {
  skip: number
  take: number
  search?: string
  sort: string
  order: 'asc' | 'desc'
}

const SORTABLE = new Set(['name', 'createdAt'])

function buildWhere(search?: string): Prisma.DepartmentWhereInput {
  if (!search) return {}
  return { name: { contains: search, mode: 'insensitive' } }
}

export function findMany(params: DepartmentListParams) {
  const orderField = SORTABLE.has(params.sort) ? params.sort : 'name'
  return prisma.department.findMany({
    where: buildWhere(params.search),
    skip: params.skip,
    take: params.take,
    orderBy: { [orderField]: params.order },
    include: { _count: { select: { employees: true } } }
  })
}

export function count(search?: string) {
  return prisma.department.count({ where: buildWhere(search) })
}

export function findById(id: string) {
  return prisma.department.findUnique({
    where: { id },
    include: { _count: { select: { employees: true } } }
  })
}

export function create(data: Prisma.DepartmentCreateInput) {
  return prisma.department.create({ data })
}

export function update(id: string, data: Prisma.DepartmentUpdateInput) {
  return prisma.department.update({ where: { id }, data })
}

/** Soft delete: the department stays auditable and can be restored. */
export function remove(id: string) {
  return prisma.department.update({ where: { id }, data: { deletedAt: new Date() } })
}

export function countEmployees(departmentId: string) {
  return prisma.employee.count({ where: { departmentId } })
}
