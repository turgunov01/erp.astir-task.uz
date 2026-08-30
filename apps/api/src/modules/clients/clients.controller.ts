import type { NextFunction, Request, Response } from 'express'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { validatedQuery } from '../../middleware/validate'
import { recordActivity, recordAudit } from '../../lib/activity'
import { forbidden } from '../../lib/errors'
import * as service from './clients.service'

/** Portal users may only ever read their own client record (spec 36). */
function assertClientScope(req: Request, clientId: string) {
  if (req.user?.role === 'CLIENT' && req.user.clientId !== clientId) {
    throw forbidden()
  }
}

export async function listHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validatedQuery<Parameters<typeof service.list>[0]>(req)
    const result = await service.list(query)

    if (req.user?.role === 'CLIENT') {
      const own = result.items.filter(item => item.id === req.user?.clientId)
      return sendList(res, own, { ...result.meta, total: own.length, pages: 1 })
    }
    return sendList(res, result.items, result.meta)
  } catch (err) {
    next(err)
  }
}

export async function getHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string
    assertClientScope(req, id)
    return sendItem(res, await service.getById(id))
  } catch (err) {
    next(err)
  }
}

export async function createHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const client = await service.create(req.body)
    await recordActivity({
      actorId: req.user?.id,
      entityType: 'Client',
      entityId: client.id,
      action: 'client.created',
      metadata: { name: client.name }
    })
    return sendItem(res, client, 201)
  } catch (err) {
    next(err)
  }
}

export async function updateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const client = await service.update(req.params.id as string, req.body)
    await recordActivity({
      actorId: req.user?.id,
      entityType: 'Client',
      entityId: client.id,
      action: 'client.updated'
    })
    return sendItem(res, client)
  } catch (err) {
    next(err)
  }
}

export async function archiveHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string
    await service.archive(id)
    await recordAudit({
      actorId: req.user?.id,
      action: 'client.archived',
      entityType: 'Client',
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    })
    return sendNoContent(res)
  } catch (err) {
    next(err)
  }
}
