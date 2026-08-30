import type { CreateClientInput, UpdateClientInput } from '@astir/validation'
import { conflict, notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import * as repo from './clients.repository'

interface ClientListQuery {
  page: number
  limit: number
  search?: string
  status?: string
  sort?: string
  order: 'asc' | 'desc'
}

export async function list(query: ClientListQuery) {
  const { skip, take } = toSkipTake(query.page, query.limit)
  const filters = { search: query.search, status: query.status }
  const [items, total] = await Promise.all([
    repo.findMany({ ...filters, skip, take, sort: query.sort ?? 'createdAt', order: query.order }),
    repo.count(filters)
  ])
  return { items, meta: buildMeta(total, query.page, query.limit) }
}

export async function getById(id: string) {
  const client = await repo.findById(id)
  if (!client) throw notFound('Client')
  return client
}

export function create(input: CreateClientInput) {
  return repo.create(input)
}

export async function update(id: string, input: UpdateClientInput) {
  await getById(id)
  return repo.update(id, input)
}

/**
 * Archive rather than hard delete, and refuse while work is still live so a
 * client cannot vanish out from under an in-flight project.
 */
export async function archive(id: string) {
  await getById(id)
  const active = await repo.countActiveProjects(id)
  if (active > 0) {
    throw conflict('Client still has ' + active + ' active project(s).')
  }
  return repo.softDelete(id)
}
