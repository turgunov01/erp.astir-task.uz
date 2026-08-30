import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request flags the data layer needs but the call chain does not carry.
 *
 * The archive filter lives in a Prisma extension so no module can forget it,
 * which means the "show me the archive instead" signal has to reach the
 * extension some other way. Threading a flag through twelve services and their
 * repositories would touch every list query; an async-local store keeps it in
 * one place.
 */
export interface RequestContext {
  /** Set by `?archived=true`: list archived rows instead of active ones. */
  includeArchived: boolean
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

export function shouldListArchived(): boolean {
  return storage.getStore()?.includeArchived ?? false
}
