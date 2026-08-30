import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

/**
 * Prisma 7 moved the migrate/introspect connection URL out of schema.prisma.
 * The runtime client gets its connection through a driver adapter instead
 * (see src/lib/prisma.ts).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL')
  },
  migrations: {
    seed: 'tsx prisma/seed.ts'
  }
})
