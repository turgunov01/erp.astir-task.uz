import { Router } from 'express'
import { z } from 'zod'
import { idParamSchema, listQuerySchema } from '@astir/validation'
import { authenticate } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent, buildMeta, toSkipTake } from '../../lib/http'
import { notFound, unauthenticated } from '../../lib/errors'
import { prisma } from '../../lib/prisma'

const listSchema = listQuerySchema.extend({
  unreadOnly: z.coerce.boolean().optional()
})

export const notificationsRouter = Router()

notificationsRouter.use(authenticate)

/** Own notifications only — there is no cross-user access by design. */
notificationsRouter.get(
  '/',
  validate(listSchema, 'query'),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthenticated()
      const query = validatedQuery<z.infer<typeof listSchema>>(req)
      const { skip, take } = toSkipTake(query.page, query.limit)

      const where = {
        userId: req.user.id,
        ...(query.unreadOnly ? { readAt: null } : {})
      }

      const [items, total, unread] = await Promise.all([
        prisma.notification.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId: req.user.id, readAt: null } })
      ])

      res.setHeader('x-unread-count', String(unread))
      return sendList(res, items, buildMeta(total, query.page, query.limit))
    } catch (err) {
      next(err)
    }
  }
)

notificationsRouter.get('/unread-count', async (req, res, next) => {
  try {
    if (!req.user) throw unauthenticated()
    const count = await prisma.notification.count({
      where: { userId: req.user.id, readAt: null }
    })
    return sendItem(res, { count })
  } catch (err) {
    next(err)
  }
})

notificationsRouter.post(
  '/:id/read',
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthenticated()
      const id = req.params.id as string

      // Scoped by userId so one user cannot mark another user's row as read.
      const updated = await prisma.notification.updateMany({
        where: { id, userId: req.user.id, readAt: null },
        data: { readAt: new Date() }
      })
      if (updated.count === 0) {
        const exists = await prisma.notification.findFirst({
          where: { id, userId: req.user.id },
          select: { id: true }
        })
        if (!exists) throw notFound('Notification')
      }
      return sendNoContent(res)
    } catch (err) {
      next(err)
    }
  }
)

notificationsRouter.post('/read-all', async (req, res, next) => {
  try {
    if (!req.user) throw unauthenticated()
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() }
    })
    return sendItem(res, { marked: result.count })
  } catch (err) {
    next(err)
  }
})
