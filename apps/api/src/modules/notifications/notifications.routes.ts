import { Router } from 'express'
import { z } from 'zod'
import { CONFIGURABLE_NOTIFICATION_CHANNELS, NOTIFICATION_TYPE } from '@astir/types'
import {
  idParamSchema,
  listQuerySchema,
  updateNotificationPreferencesSchema
} from '@astir/validation'
import { authenticate } from '../../middleware/auth'
import { validate, validatedQuery } from '../../middleware/validate'
import { sendItem, sendList, sendNoContent, buildMeta, toSkipTake } from '../../lib/http'
import { badRequest, notFound, unauthenticated } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { hasEmailChannel } from '../../lib/notify-email'
import { t } from '../../i18n'

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

/* ------------------------------------------------------------ preferences */

/**
 * Every type with its switches, defaults filled in.
 *
 * Opt-out model: a missing row means "on", so the list is built from the
 * full type catalogue rather than from what happens to be stored. `email` is
 * null for types that never send a letter, so the screen can say so instead
 * of offering a switch that does nothing.
 */
async function preferencesFor(userId: string) {
  const stored = await prisma.notificationPreference.findMany({
    where: { userId, channel: { in: [...CONFIGURABLE_NOTIFICATION_CHANNELS] } },
    select: { type: true, channel: true, enabled: true }
  })
  const lookup = new Map(stored.map(row => [row.type + ':' + row.channel, row.enabled]))

  return Object.values(NOTIFICATION_TYPE).map(type => ({
    type,
    inApp: lookup.get(type + ':IN_APP') ?? true,
    email: hasEmailChannel(type) ? (lookup.get(type + ':EMAIL') ?? true) : null
  }))
}

notificationsRouter.get('/preferences', async (req, res, next) => {
  try {
    if (!req.user) throw unauthenticated()
    return sendItem(res, await preferencesFor(req.user.id))
  } catch (err) {
    next(err)
  }
})

/** Own preferences only; the body carries just the switches that changed. */
notificationsRouter.put(
  '/preferences',
  validate(updateNotificationPreferencesSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthenticated()
      const userId = req.user.id
      const { preferences } = req.body as z.infer<typeof updateNotificationPreferencesSchema>

      const unsupported = preferences.find(
        item => item.channel === 'EMAIL' && !hasEmailChannel(item.type)
      )
      if (unsupported) {
        throw badRequest(t('team.settings.noEmailForType'))
      }

      await prisma.$transaction(
        preferences.map(item =>
          prisma.notificationPreference.upsert({
            where: {
              userId_type_channel: { userId, type: item.type, channel: item.channel }
            },
            create: { userId, type: item.type, channel: item.channel, enabled: item.enabled },
            update: { enabled: item.enabled }
          })
        )
      )

      return sendItem(res, await preferencesFor(userId))
    } catch (err) {
      next(err)
    }
  }
)

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
