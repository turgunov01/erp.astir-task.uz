import { createApp } from './app'
import { env } from './config/env'
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import { installBigIntSerializer } from './lib/json'

async function main() {
  installBigIntSerializer()

  // Fail fast if the database is unreachable rather than serving 500s.
  await prisma.$connect()
  logger.info('database connection established')

  const app = createApp()
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info('Aster ERP API listening on http://127.0.0.1:' + env.PORT)
  })

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down')
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
    // Do not let a hung connection block the deploy.
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch(err => {
  logger.error({ err }, 'failed to start API')
  process.exit(1)
})
