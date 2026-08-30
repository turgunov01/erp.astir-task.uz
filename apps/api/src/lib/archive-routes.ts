import type { NextFunction, Request, Response, Router } from 'express'
import type { Permission } from '@astir/types'
import { idParamSchema } from '@astir/validation'
import { requirePermission } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { sendItem } from './http'
import { notFound } from './errors'
import { prisma } from './prisma'
import { recordActivity } from './activity'

/**
 * The slice of a Prisma delegate these routes need.
 *
 * `findUnique` rather than `findFirst` on purpose: the archive filter skips
 * `findUnique`, so an already archived row is still reachable for unarchiving.
 */
interface ArchiveDelegate {
  findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>
  update(args: {
    where: { id: string }
    data: { archivedAt: Date | null }
  }): Promise<Record<string, unknown>>
}

export interface ArchiveRouteOptions {
  /** Prisma delegate key, e.g. `renderJob`. */
  model: string
  /** Label written to the activity log, e.g. `RenderJob`. */
  entityType: string
  /** Permission required to archive and to restore. */
  permission: Permission
}

/**
 * Adds `POST /:id/archive` and `POST /:id/unarchive` to a module router.
 *
 * Twelve modules need the identical pair, and hand-writing them twelve times
 * is how one of them ends up without an activity log entry.
 */
export function mountArchiveRoutes(router: Router, options: ArchiveRouteOptions) {
  function delegate(): ArchiveDelegate {
    const client = prisma as unknown as Record<string, ArchiveDelegate | undefined>
    const found = client[options.model]
    if (!found) throw new Error('Unknown Prisma model: ' + options.model)
    return found
  }

  function handler(archived: boolean) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = req.params.id as string
        const existing = await delegate().findUnique({ where: { id } })
        if (!existing) throw notFound(options.entityType)

        const row = await delegate().update({
          where: { id },
          data: { archivedAt: archived ? new Date() : null }
        })

        await recordActivity({
          actorId: req.user?.id,
          entityType: options.entityType,
          entityId: id,
          action: archived ? 'archived' : 'unarchived',
          projectId: (existing.projectId as string | undefined) ?? undefined
        })

        return sendItem(res, row)
      } catch (err) {
        next(err)
      }
    }
  }

  router.post(
    '/:id/archive',
    requirePermission(options.permission),
    validate(idParamSchema, 'params'),
    handler(true)
  )

  router.post(
    '/:id/unarchive',
    requirePermission(options.permission),
    validate(idParamSchema, 'params'),
    handler(false)
  )
}
