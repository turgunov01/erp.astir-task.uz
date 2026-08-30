import type { NextFunction, Request, Response } from 'express'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { validatedQuery } from '../../middleware/validate'
import { recordActivity, recordAudit } from '../../lib/activity'
import * as service from './employees.service'

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
    const employee = await service.create(req.body)
    await recordAudit({
      actorId: req.user?.id,
      action: 'user.created',
      entityType: 'Employee',
      entityId: employee.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { email: employee.user.email, role: employee.user.role }
    })
    return sendItem(res, employee, 201)
  } catch (err) {
    next(err)
  }
}

export async function updateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const employee = await service.update(req.params.id as string, req.body)
    // Role changes are security relevant and belong in the audit log (spec 50).
    if (req.body.role) {
      await recordAudit({
        actorId: req.user?.id,
        action: 'user.role_changed',
        entityType: 'Employee',
        entityId: employee.id,
        ipAddress: req.ip,
        metadata: { to: req.body.role }
      })
    }
    await recordActivity({
      actorId: req.user?.id,
      entityType: 'Employee',
      entityId: employee.id,
      action: 'employee.updated'
    })
    return sendItem(res, employee)
  } catch (err) {
    next(err)
  }
}

export async function deactivateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string
    await service.deactivate(id)
    await recordAudit({
      actorId: req.user?.id,
      action: 'user.deactivated',
      entityType: 'Employee',
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    })
    return sendNoContent(res)
  } catch (err) {
    next(err)
  }
}

/**
 * Confirm an employee`s address without the emailed code.
 *
 * Needed while the studio has no working mail: without it a new hire could
 * never finish the first login.
 */
export async function verifyEmailHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const employee = await service.verifyEmail(req.params.id as string)
    await recordActivity({
      actorId: req.user?.id,
      entityType: 'Employee',
      entityId: req.params.id as string,
      action: 'employee.email_verified_manually'
    })
    return sendItem(res, employee)
  } catch (err) {
    next(err)
  }
}
