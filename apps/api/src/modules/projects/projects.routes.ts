import { Router } from 'express'
import {
  addProjectMemberSchema,
  memberParamSchema,
  updateProjectMemberSchema,
  createProjectSchema,
  idParamSchema,
  projectListQuerySchema,
  updateProjectSchema
} from '@astir/validation'
import { PERMISSION } from '@astir/types'
import { authenticate, requirePermission } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import * as controller from './projects.controller'
import * as members from './members.service'
import * as service from './projects.service'
import { recordAudit } from '../../lib/activity'
import { z } from 'zod'
import { sendItem, sendList, sendNoContent } from '../../lib/http'
import { mountArchiveRoutes } from '../../lib/archive-routes'

export const projectsRouter = Router()

projectsRouter.use(authenticate)

projectsRouter.get(
  '/',
  requirePermission(PERMISSION.PROJECT_VIEW),
  validate(projectListQuerySchema, 'query'),
  controller.listHandler
)

projectsRouter.get(
  '/:id',
  requirePermission(PERMISSION.PROJECT_VIEW),
  validate(idParamSchema, 'params'),
  controller.getHandler
)

projectsRouter.post(
  '/',
  requirePermission(PERMISSION.PROJECT_CREATE),
  validate(createProjectSchema),
  controller.createHandler
)

projectsRouter.patch(
  '/:id',
  requirePermission(PERMISSION.PROJECT_UPDATE),
  validate(idParamSchema, 'params'),
  validate(updateProjectSchema),
  controller.updateHandler
)

projectsRouter.post(
  '/:id/refresh-health',
  requirePermission(PERMISSION.PROJECT_UPDATE),
  validate(idParamSchema, 'params'),
  controller.refreshHealthHandler
)

projectsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.PROJECT_ARCHIVE),
  validate(idParamSchema, 'params'),
  controller.archiveHandler
)

// ---------------------------------------------------------------- members

projectsRouter.get(
  '/:id/members',
  requirePermission(PERMISSION.PROJECT_VIEW),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const roster = await members.list(req.params.id as string)
      return sendList(res, roster, {
        page: 1, limit: roster.length, total: roster.length, pages: 1
      })
    } catch (err) {
      next(err)
    }
  }
)

// Candidates for the picker; excludes people already on the project.
projectsRouter.get(
  '/:id/members/available',
  requirePermission(PERMISSION.PROJECT_VIEW),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const candidates = await members.available(req.params.id as string)
      return sendList(res, candidates, {
        page: 1, limit: candidates.length, total: candidates.length, pages: 1
      })
    } catch (err) {
      next(err)
    }
  }
)

projectsRouter.post(
  '/:id/members',
  requirePermission(PERMISSION.TASK_ASSIGN),
  validate(idParamSchema, 'params'),
  validate(addProjectMemberSchema),
  async (req, res, next) => {
    try {
      const member = await members.add(req.params.id as string, req.body, req.user?.id)
      return sendItem(res, member, 201)
    } catch (err) {
      next(err)
    }
  }
)

projectsRouter.patch(
  '/:id/members/:userId',
  requirePermission(PERMISSION.TASK_ASSIGN),
  validate(memberParamSchema, 'params'),
  validate(updateProjectMemberSchema),
  async (req, res, next) => {
    try {
      const member = await members.updateRoleLabel(
        req.params.id as string,
        req.params.userId as string,
        req.body.roleLabel ?? null
      )
      return sendItem(res, member)
    } catch (err) {
      next(err)
    }
  }
)

projectsRouter.delete(
  '/:id/members/:userId',
  requirePermission(PERMISSION.TASK_ASSIGN),
  validate(memberParamSchema, 'params'),
  async (req, res, next) => {
    try {
      await members.remove(
        req.params.id as string,
        req.params.userId as string,
        req.user?.id
      )
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * Permanent deletion.
 *
 * Separate verb from DELETE /:id, which archives. Requires PROJECT_DELETE,
 * held only by the owner, plus the project code echoed in the body.
 */
projectsRouter.post(
  '/:id/hard-delete',
  requirePermission(PERMISSION.PROJECT_DELETE),
  validate(idParamSchema, 'params'),
  validate(z.object({ confirmCode: z.string().min(1) })),
  async (req, res, next) => {
    try {
      const id = req.params.id as string
      const project = await service.hardDelete(id, req.body.confirmCode)

      await recordAudit({
        actorId: req.user?.id,
        action: 'project.hard_deleted',
        entityType: 'Project',
        entityId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { code: project.code, name: project.name }
      })

      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

// Archiving hides a row from the working set; deleting is the separate,
// confirmed action.
mountArchiveRoutes(projectsRouter, {
  model: 'project',
  entityType: 'Project',
  permission: PERMISSION.PROJECT_ARCHIVE
})
