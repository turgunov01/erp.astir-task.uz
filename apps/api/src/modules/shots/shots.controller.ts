import type { NextFunction, Request, Response } from 'express'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { validatedQuery } from '../../middleware/validate'
import * as service from './shots.service'

export async function listHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.list(validatedQuery<never>(req))
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
    return sendItem(res, await service.create(req.body, req.user?.id), 201)
  } catch (err) {
    next(err)
  }
}

export async function updateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return sendItem(res, await service.update(req.params.id as string, req.body, req.user?.id))
  } catch (err) {
    next(err)
  }
}

export async function updateStageHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const shot = await service.updateStage(
      req.params.id as string,
      req.params.stageId as string,
      req.body,
      req.user?.id
    )
    return sendItem(res, shot)
  } catch (err) {
    next(err)
  }
}

export async function removeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await service.remove(req.params.id as string)
    return sendNoContent(res)
  } catch (err) {
    next(err)
  }
}
