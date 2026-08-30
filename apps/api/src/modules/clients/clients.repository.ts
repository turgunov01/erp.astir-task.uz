import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

export interface ClientListParams {
  skip: number
  take: number
  search?: string
  status?: string
  sort: string
  order: 'asc' | 'desc'
}

const SORTABLE = new Set(['name', 'createdAt', 'status'])

export function buildWhere(params: { search?: string, status?: string }): Prisma.ClientWhereInput {
  const where: Prisma.ClientWhereInput = { deletedAt: null }
  if (params.status) where.status = params.status as Prisma.ClientWhereInput['status']
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { companyName: { contains: params.search, mode: 'insensitive' } },
      { email: { contains: params.search, mode: 'insensitive' } }
    ]
  }
  return where
}

export function findMany(params: ClientListParams) {
  const orderField = SORTABLE.has(params.sort) ? params.sort : 'createdAt'
  return prisma.client.findMany({
    where: buildWhere(params),
    skip: params.skip,
    take: params.take,
    orderBy: { [orderField]: params.order },
    include: { _count: { select: { projects: true, contacts: true } } }
  })
}

export function count(params: { search?: string, status?: string }) {
  return prisma.client.count({ where: buildWhere(params) })
}

export function findById(id: string) {
  return prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      contacts: { orderBy: { isPrimary: 'desc' } },
      _count: { select: { projects: true } }
    }
  })
}

export function create(data: Prisma.ClientCreateInput) {
  return prisma.client.create({ data })
}

export function update(id: string, data: Prisma.ClientUpdateInput) {
  return prisma.client.update({ where: { id }, data })
}

/** Soft delete: clients are referenced by projects, payments and invoices. */
export function softDelete(id: string) {
  return prisma.client.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'ARCHIVED' }
  })
}

export function countActiveProjects(clientId: string) {
  return prisma.project.count({
    where: {
      clientId,
      deletedAt: null,
      status: { notIn: ['COMPLETED', 'CANCELLED', 'ARCHIVED'] }
    }
  })
}
