import type { ListQuery } from '@astir/validation'
import { conflict, notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import * as repo from './departments.repository'

export async function list(query: ListQuery) {
  const { skip, take } = toSkipTake(query.page, query.limit)
  const [items, total] = await Promise.all([
    repo.findMany({
      skip,
      take,
      search: query.search,
      sort: query.sort ?? 'name',
      order: query.order
    }),
    repo.count(query.search)
  ])
  return { items, meta: buildMeta(total, query.page, query.limit) }
}

export async function getById(id: string) {
  const department = await repo.findById(id)
  if (!department) throw notFound('Department')
  return department
}

export function create(input: { name: string, description?: string | null }) {
  return repo.create({ name: input.name, description: input.description ?? null })
}

export async function update(
  id: string,
  input: { name?: string, description?: string | null }
) {
  await getById(id)
  return repo.update(id, input)
}

/**
 * Departments are referenced by employees and pipeline stages. Deleting one
 * with staff attached would silently orphan them, so it is refused with a
 * count the UI can show rather than cascading.
 */
export async function remove(id: string) {
  await getById(id)
  const employees = await repo.countEmployees(id)
  if (employees > 0) {
    throw conflict(
      'Department still has ' + employees + ' employee(s). Reassign them first.'
    )
  }
  await repo.remove(id)
}
