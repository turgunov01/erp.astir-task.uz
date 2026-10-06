import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { env, isDevelopment } from '../config/env'
import { FILTERED_OPERATIONS, isArchivable, isSoftDeletable } from './archivable'
import { shouldListArchived } from './request-context'
import { flushTransactionQueue, openTransactionQueue, type AfterCommitHook } from './after-commit'

/**
 * Single Prisma instance.
 *
 * Prisma 7 connects through a driver adapter rather than a schema-level url.
 * The instance is cached on globalThis so tsx watch reloads reuse one pool
 * instead of opening a new one on every file change.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
  const client = new PrismaClient({
    adapter,
    log: isDevelopment ? ['warn', 'error'] : ['error']
  })

  /*
   * Archived rows drop out of every list read unless the caller names
   * `archivedAt` itself. Doing it here rather than in each module means a
   * new query cannot forget the filter and quietly show archived rows.
   */
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!FILTERED_OPERATIONS.has(operation)) return query(args)

          const params = args as { where?: Record<string, unknown> }
          const where = params.where ?? {}
          const added: Record<string, unknown> = {}

          if (isArchivable(model) && !('archivedAt' in where)) {
            added.archivedAt = shouldListArchived() ? { not: null } : null
          }
          if (isSoftDeletable(model) && !('deletedAt' in where)) {
            added.deletedAt = null
          }

          if (Object.keys(added).length === 0) return query(args)
          return query({ ...params, where: { ...where, ...added } })
        }
      }
    }
  })
}

/**
 * Give interactive transactions an after-commit queue (see after-commit.ts).
 *
 * Only the callback form is wrapped: the array form has no client for anyone
 * to queue work against. The queue is flushed when the transaction resolves
 * and simply forgotten when it throws, so nothing queued outlives a rollback.
 */
function withAfterCommit(client: PrismaClient): PrismaClient {
  const original = client.$transaction.bind(client) as (...args: unknown[]) => Promise<unknown>

  const transaction = (arg: unknown, options?: unknown) => {
    if (typeof arg !== 'function') return original(arg, options)

    let hooks: AfterCommitHook[] = []
    return original(async (tx: object) => {
      hooks = openTransactionQueue(tx)
      return (arg as (tx: object) => Promise<unknown>)(tx)
    }, options).then(result => {
      flushTransactionQueue(hooks)
      return result
    })
  }

  return new Proxy(client, {
    get(target, prop) {
      if (prop === '$transaction') return transaction
      const value = Reflect.get(target, prop, target) as unknown
      // Bound to the real client: Prisma's methods expect it as `this`.
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    }
  })
}

/*
 * Typed as the plain client on purpose. The extension only changes which
 * rows a read returns, never the shape of the API, and letting the extended
 * type escape here makes every delegate call in the codebase resolve to an
 * unusable union.
 */
export const prisma = (globalForPrisma.prisma ??
  withAfterCommit(createClient() as unknown as PrismaClient)) as PrismaClient

if (isDevelopment) globalForPrisma.prisma = prisma
