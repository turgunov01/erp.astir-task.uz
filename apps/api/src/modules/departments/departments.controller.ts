import type { NextFunction, Request, Response } from 'express'
import type { ListQuery } from '@astir/validation'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { validatedQuery } from '../../middleware/validate'
import { recordActivity } from '../../lib/activity'
import * as service from './departments.service'

export async function listHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.list(validatedQuery<ListQuery>(req))
    return sendList(res, result.items, result.meta)
  } catch (err) {
    next(err)
  }
}

export async function getHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return sendItem(res, await service.getById(req.params.id as string))
  } catch (err) {
    next(err)
  }
}

export async function createHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const department = await service.create(req.body)
    await recordActivity({
      actorId: req.user?.id,
      entityType: 'Department',
      entityId: department.id,
      action: 'department.created',
      metadata: { name: department.name }
    })
    return sendItem(res, department, 201)
  } catch (err) {
    next(err)
  }
}

export async function updateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const department = await service.update(req.params.id as string, req.body)
    await recordActivity({
      actorId: req.user?.id,
      entityType: 'Department',
      entityId: department.id,
      action: 'department.updated'
    })
    return sendItem(res, department)
  } catch (err) {
    next(err)
  }
}

export async function removeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await service.remove(req.params.id as string)
    await recordActivity({
      actorId: req.user?.id,
      entityType: 'Department',
      entityId: req.params.id as string,
      action: 'department.deleted'
    })
    return sendNoContent(res)
  } catch (err) {
    next(err)
  }
}
