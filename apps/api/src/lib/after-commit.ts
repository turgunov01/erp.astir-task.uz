import { logger } from './logger'

/**
 * Work that must wait for a transaction to commit.
 *
 * Some side effects — an email, a webhook — cannot be taken back, so they must
 * not leave while the write that justifies them can still roll back. Prisma has
 * no commit hook, so `prisma.$transaction` is wrapped (see prisma.ts): every
 * interactive transaction gets a queue keyed by its client, and the queue runs
 * once the transaction resolves or is dropped if it throws.
 */

export type AfterCommitHook = () => void

const queues = new WeakMap<object, AfterCommitHook[]>()

/** Start a queue for a transaction client. Called by the prisma wrapper only. */
export function openTransactionQueue(tx: object): AfterCommitHook[] {
  const hooks: AfterCommitHook[] = []
  queues.set(tx, hooks)
  return hooks
}

/** Run a committed transaction's hooks, each isolated from the others. */
export function flushTransactionQueue(hooks: AfterCommitHook[]): void {
  for (const hook of hooks) runSoon(hook)
}

/**
 * Off the request's critical path: the response is not held up by whatever
 * the hook does, and a hook that throws cannot reach the caller.
 */
function runSoon(hook: AfterCommitHook): void {
  setImmediate(() => {
    try {
      hook()
    } catch (err) {
      logger.error({ err }, 'after-commit hook failed')
    }
  })
}

/**
 * Run `hook` once `tx` has committed, or soon if there is no transaction.
 *
 * A client the wrapper never saw (a transaction opened some other way) has no
 * queue; the hook then runs right away rather than being lost, with a warning
 * so the path can be fixed.
 */
export function afterCommit(tx: object | null, hook: AfterCommitHook): void {
  if (!tx) return runSoon(hook)

  const hooks = queues.get(tx)
  if (hooks) {
    hooks.push(hook)
    return
  }

  logger.warn('afterCommit called with an untracked transaction; running immediately')
  runSoon(hook)
}
