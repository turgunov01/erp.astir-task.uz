import { Router } from 'express'
import { prisma } from '../../lib/prisma'

export const healthRouter = Router()

/** Liveness plus a real database round trip, for deploy smoke checks (spec 93). */
healthRouter.get('/', async (_req, res) => {
  const startedAt = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return res.json({
      data: {
        status: 'ok',
        database: 'up',
        latencyMs: Date.now() - startedAt,
        uptimeSeconds: Math.round(process.uptime())
      }
    })
  } catch {
    return res.status(503).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Database unreachable' }
    })
  }
})
