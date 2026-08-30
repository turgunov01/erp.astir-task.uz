import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import pinoHttp from 'pino-http'
import rateLimit from 'express-rate-limit'
import { env } from './config/env'
import { logger } from './lib/logger'
import { errorHandler, notFoundHandler } from './middleware/error'
import { authRouter } from './modules/auth/auth.routes'
import { healthRouter } from './modules/health/health.routes'
import { departmentsRouter } from './modules/departments/departments.routes'
import { clientsRouter } from './modules/clients/clients.routes'
import { employeesRouter } from './modules/employees/employees.routes'
import { projectsRouter } from './modules/projects/projects.routes'
import { stagesRouter } from './modules/stages/stages.routes'
import { episodesRouter } from './modules/episodes/episodes.routes'
import { scenesRouter } from './modules/scenes/scenes.routes'
import { shotsRouter } from './modules/shots/shots.routes'
import { tasksRouter } from './modules/tasks/tasks.routes'
import { filesRouter } from './modules/files/files.routes'
import { notificationsRouter } from './modules/notifications/notifications.routes'
import { dashboardRouter } from './modules/dashboard/dashboard.routes'
import { reviewsRouter } from './modules/reviews/reviews.routes'
import { revisionsRouter } from './modules/revisions/revisions.routes'
import { versionsRouter } from './modules/versions/versions.routes'
import { assetsRouter } from './modules/assets/assets.routes'
import { renderRouter } from './modules/render/render.routes'
import { commentsRouter } from './modules/comments/comments.routes'
import { financeRouter } from './modules/finance/finance.routes'
import { runWithRequestContext } from './lib/request-context'
import { timesheetsRouter } from './modules/timesheets/timesheets.routes'

export function createApp() {
  const app = express()

  // Behind nginx in production; needed for correct req.ip in rate limiting.
  app.set('trust proxy', 1)

  // List payloads run to tens of kilobytes of JSON; gzip cuts them by ~85%.
  // Threshold skips tiny bodies where the header overhead is not worth it.
  app.use(compression({ threshold: 1024 }))

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

  app.use(
    cors({
      origin: [env.APP_URL],
      credentials: true
    })
  )

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))
  app.use(cookieParser())

  app.use(
    pinoHttp({
      logger,
      // Health checks would otherwise dominate the log.
      autoLogging: { ignore: req => req.url === '/api/health' }
    })
  )

  // Blanket limiter; per-route limiters tighten sensitive endpoints (spec 69).
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false
    })
  )

  // Local storage mode serves blobs directly; object storage would sign URLs.
  app.use('/uploads', express.static(env.STORAGE_PATH, { maxAge: '1h', index: false }))

  // Carries ?archived=true down to the Prisma archive filter.
  app.use((req, _res, next) => {
    const flag = req.query.archived
    const includeArchived = flag === 'true' || flag === '1'
    runWithRequestContext({ includeArchived }, next)
  })

  app.use('/api/health', healthRouter)
  app.use('/api/auth', authRouter)
  app.use('/api/departments', departmentsRouter)
  app.use('/api/clients', clientsRouter)
  app.use('/api/employees', employeesRouter)
  app.use('/api/projects', projectsRouter)
  app.use('/api/stages', stagesRouter)
  app.use('/api/episodes', episodesRouter)
  app.use('/api/scenes', scenesRouter)
  app.use('/api/shots', shotsRouter)
  app.use('/api/tasks', tasksRouter)
  app.use('/api/files', filesRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/timesheets', timesheetsRouter)
  app.use('/api/reviews', reviewsRouter)
  app.use('/api/revisions', revisionsRouter)
  app.use('/api/versions', versionsRouter)
  app.use('/api/assets', assetsRouter)
  app.use('/api/render', renderRouter)
  app.use('/api/comments', commentsRouter)
  app.use('/api/finance', financeRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
