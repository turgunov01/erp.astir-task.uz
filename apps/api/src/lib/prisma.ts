import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { env, isDevelopment } from '../config/env'
import { FILTERED_OPERATIONS, isArchivable, isSoftDeletable } from './archivable'
import { shouldListArchived } from './request-context'

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

/*
 * Typed as the plain client on purpose. The extension only changes which
 * rows a read returns, never the shape of the API, and letting the extended
 * type escape here makes every delegate call in the codebase resolve to an
 * unusable union.
 */
export const prisma = (globalForPrisma.prisma ??
  (createClient() as unknown as PrismaClient)) as PrismaClient

if (isDevelopment) globalForPrisma.prisma = prisma
