/**
 * PM2 processes for Aster ERP.
 *
 * Two processes rather than one: the Express API and the built Nuxt server have
 * different failure modes, and keeping them apart means a crash in one is
 * visible and restartable without touching the other.
 *
 * Paths and ports come from the environment, so the same file serves a second
 * deployment without being edited.
 */
const APP_DIR = process.env.APP_DIR || '/var/www/erp.astir-task.uz'
const RELEASE = APP_DIR + '/current'
const API_PORT = process.env.API_PORT || '4100'
const WEB_PORT = process.env.WEB_PORT || '3100'

/** Restart on a crash, but give up on a boot loop instead of thrashing. */
const common = {
  exec_mode: 'fork',
  instances: 1,
  autorestart: true,
  max_restarts: 10,
  min_uptime: '20s',
  restart_delay: 2000,
  max_memory_restart: '600M',
  time: true
}

module.exports = {
  apps: [
    {
      ...common,
      name: 'erp-astir-task-api',
      cwd: RELEASE + '/apps/api',
      // tsx runs the TypeScript sources directly, the same way the API starts in
      // development — one less build step that can diverge between the two.
      script: RELEASE + '/node_modules/.bin/tsx',
      args: 'src/server.ts',
      env: {
        NODE_ENV: 'production',
        PORT: API_PORT
      },
      error_file: APP_DIR + '/logs/api.error.log',
      out_file: APP_DIR + '/logs/api.out.log'
    },
    {
      ...common,
      name: 'erp-astir-task-web',
      cwd: RELEASE + '/apps/web',
      // Nuxt builds a self-contained Nitro server; node runs it directly.
      script: RELEASE + '/apps/web/.output/server/index.mjs',
      env: {
        NODE_ENV: 'production',
        PORT: WEB_PORT,
        HOST: '127.0.0.1',
        // The web server proxies /api and /uploads to the API on this same box.
        NUXT_API_ORIGIN: 'http://127.0.0.1:' + API_PORT
      },
      error_file: APP_DIR + '/logs/web.error.log',
      out_file: APP_DIR + '/logs/web.out.log'
    }
  ]
}
