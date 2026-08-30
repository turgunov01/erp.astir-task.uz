/**
 * Models that carry an `archivedAt` column.
 *
 * Archiving and deleting are different actions: archiving hides a row from the
 * working set and can be undone from the UI, deleting sets `deletedAt` and
 * takes the row out of circulation entirely.
 */
export const ARCHIVABLE_MODELS = [
  'Client', 'Project', 'Episode', 'Scene', 'Shot', 'Asset',
  'Review', 'Revision', 'Document', 'RenderJob', 'Department', 'Employee'
] as const

export type ArchivableModel = (typeof ARCHIVABLE_MODELS)[number]

const LOOKUP = new Set<string>(ARCHIVABLE_MODELS)

export function isArchivable(model: string | undefined): model is ArchivableModel {
  return Boolean(model) && LOOKUP.has(model as string)
}

/**
 * Multi-row reads, which must not surface archived rows unless asked.
 *
 * Single-row lookups (findUnique, findFirst) are deliberately absent: opening
 * an archived row by id has to keep working, otherwise the archive view would
 * list rows whose detail panel answers 404.
 */
export const FILTERED_OPERATIONS = new Set([
  'findMany',
  'count',
  'aggregate',
  'groupBy'
])

/**
 * Models with a `deletedAt` column.
 *
 * Most modules already filter it by hand; listing them here means a query that
 * forgets cannot silently resurrect deleted rows. A read that names `deletedAt`
 * itself still wins, so recovery flows keep working.
 */
export const SOFT_DELETABLE_MODELS = [
  'User', 'Employee', 'Department', 'Client', 'Project', 'Episode', 'Scene',
  'Shot', 'Task', 'Asset', 'Review', 'Revision', 'Comment', 'Document', 'RenderJob'
] as const

const SOFT_LOOKUP = new Set<string>(SOFT_DELETABLE_MODELS)

export function isSoftDeletable(model: string | undefined): boolean {
  return Boolean(model) && SOFT_LOOKUP.has(model as string)
}
