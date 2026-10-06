import { logger } from '../../lib/logger'
import { sweepExpiredSessions } from './upload-sessions'

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

async function sweep() {
  try {
    const removed = await sweepExpiredSessions()
    if (removed > 0) logger.info({ removed }, 'removed abandoned upload sessions')
  } catch (err) {
    logger.error({ err }, 'upload session sweep failed')
  }
}

/**
 * Clear abandoned chunked uploads at startup and hourly after that.
 *
 * The timer is unref'd so it never keeps the process alive on shutdown.
 */
export function startUploadSweeper() {
  void sweep()
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS).unref()
}
