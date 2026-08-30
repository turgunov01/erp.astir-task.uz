import type { NextFunction, Request, Response } from 'express'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { validatedQuery } from '../../middleware/validate'
import { recordAudit } from '../../lib/activity'
import * as service from './projects.service'
import { toWireProject, toWireProjects } from './projects.mapper'

/** Client portal users only ever see their own projects (spec 36). */
function scopeToClient(req: Request, query: Record<string, unknown>) {
  if (req.user?.role === 'CLIENT') {
    return { ...query, clientId: req.user.clientId ?? '00000000-0000-0000-0000-000000000000' }
  }
  return query
}

export async function listHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = scopeToClient(req, validatedQuery<Record<string, unknown>>(req))
    const result = await service.list(query as never)
    return sendList(res, toWireProjects(result.items as never), result.meta)
  } catch (err) {
    next(err)
  }
}

export async function getHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await service.getById(req.params.id as string)
    if (req.user?.role === 'CLIENT' && project.clientId !== req.user.clientId) {
      return sendItem(res, null, 404)
    }
    return sendItem(res, toWireProject(project as never))
  } catch (err) {
    next(err)
  }
}

export async function createHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await service.create(req.body, req.user?.id)
    return sendItem(res, toWireProject(project as never), 201)
  } catch (err) {
    next(err)
  }
}

export async function updateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await service.update(req.params.id as string, req.body, req.user?.id)
    return sendItem(res, toWireProject(project as never))
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
      action: 'project.archived',
      entityType: 'Project',
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    })
    return sendNoContent(res)
  } catch (err) {
    next(err)
  }
}

export async function refreshHealthHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return sendItem(res, toWireProject(await service.refreshHealth(req.params.id as string) as never))
  } catch (err) {
    next(err)
  }
}
