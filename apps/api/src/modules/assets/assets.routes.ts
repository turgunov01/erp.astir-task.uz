import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import {
  assetListQuerySchema,
  createAssetSchema,
  idParamSchema,
  updateAssetSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { buildMeta, sendItem, sendList, sendNoContent, toSkipTake } from '../../lib/http'
import { conflict, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { recordActivity } from '../../lib/activity'
import { mountArchiveRoutes } from '../../lib/archive-routes'

const INCLUDE = {
  project: { select: { id: true, code: true, name: true } },
  owner: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { versions: true } }
} satisfies Prisma.AssetInclude

export const assetsRouter = Router()

assetsRouter.use(authenticate)

assetsRouter.get(
  '/',
  requirePermission(PERMISSION.ASSET_VIEW),
  validate(assetListQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = validatedQuery<{
        page: number, limit: number, search?: string
        type?: string, status?: string, projectId?: string
        order: 'asc' | 'desc'
      }>(req)
      const { skip, take } = toSkipTake(query.page, query.limit)

      const where: Prisma.AssetWhereInput = { deletedAt: null }
      if (query.type) where.type = query.type as never
      if (query.status) where.status = query.status as never
      if (query.projectId) where.projectId = query.projectId
      if (query.search) where.name = { contains: query.search, mode: 'insensitive' }

      const [items, total] = await Promise.all([
        prisma.asset.findMany({ where, skip, take, orderBy: { name: 'asc' }, include: INCLUDE }),
        prisma.asset.count({ where })
      ])
      return sendList(res, items, buildMeta(total, query.page, query.limit))
    } catch (err) {
      next(err)
    }
  }
)

assetsRouter.get(
  '/:id',
  requirePermission(PERMISSION.ASSET_VIEW),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const asset = await prisma.asset.findFirst({
        where: { id: req.params.id as string, deletedAt: null },
        include: {
          ...INCLUDE,
          versions: {
            orderBy: { versionNumber: 'desc' },
            select: { id: true, label: true, versionNumber: true, status: true, createdAt: true }
          }
        }
      })
      if (!asset) throw notFound('Asset')
      return sendItem(res, asset)
    } catch (err) {
      next(err)
    }
  }
)

assetsRouter.post(
  '/',
  requirePermission(PERMISSION.ASSET_MANAGE),
  validate(createAssetSchema),
  async (req, res, next) => {
    try {
      const asset = await prisma.asset.create({ data: req.body, include: INCLUDE })
      await recordActivity({
        actorId: req.user?.id,
        entityType: 'Asset',
        entityId: asset.id,
        projectId: asset.projectId,
        action: 'asset.created',
        metadata: { name: asset.name, type: asset.type }
      })
      return sendItem(res, asset, 201)
    } catch (err) {
      next(err)
    }
  }
)

assetsRouter.patch(
  '/:id',
  requirePermission(PERMISSION.ASSET_MANAGE),
  validate(idParamSchema, 'params'),
  validate(updateAssetSchema),
  async (req, res, next) => {
    try {
      const asset = await prisma.asset.update({
        where: { id: req.params.id as string },
        data: req.body,
        include: INCLUDE
      })
      return sendItem(res, asset)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * Soft delete, and refused while versions still reference the asset: those
 * versions are the production history of it.
 */
assetsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.ASSET_MANAGE),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const asset = await prisma.asset.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { versions: true } } }
      })
      if (!asset) throw notFound('Asset')
      if (asset._count.versions > 0) {
        throw conflict('У ассета ' + asset._count.versions + ' версий. Сначала удалите их.')
      }

      await prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } })
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

// Archiving hides a row from the working set; deleting is the separate,
// confirmed action.
mountArchiveRoutes(assetsRouter, {
  model: 'asset',
  entityType: 'Asset',
  permission: PERMISSION.ASSET_MANAGE
})
