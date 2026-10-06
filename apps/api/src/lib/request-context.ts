import { AsyncLocalStorage } from 'node:async_hooks'
import type { Locale } from '../i18n/locales'

/**
 * Per-request flags the data layer needs but the call chain does not carry.
 *
 * The archive filter lives in a Prisma extension so no module can forget it,
 * which means the "show me the archive instead" signal has to reach the
 * extension some other way. Threading a flag through twelve services and their
 * repositories would touch every list query; an async-local store keeps it in
 * one place.
 *
 * The interface language travels the same way: an error thrown five calls
 * deep, or a zod message produced inside `safeParse`, is worded in the
 * language of the request without anyone passing `req` down to it.
 */
export interface RequestContext {
  /** Set by `?archived=true`: list archived rows instead of active ones. */
  includeArchived: boolean
  /** From the `astir_locale` cookie or Accept-Language, before anyone signed in. */
  requestLocale: Locale | null
  /**
   * The signed-in person's own choice, set by `authenticate`. A box rather
   * than a field: the context object is created before authentication runs,
   * and the store must stay the same object for the rest of the request.
   */
  user: { locale: Locale | null }
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

export function shouldListArchived(): boolean {
  return storage.getStore()?.includeArchived ?? false
}

export function requestContext(): RequestContext | undefined {
  return storage.getStore()
}

/** Called by `authenticate` once the user row is loaded. */
export function rememberUserLocale(locale: Locale | null): void {
  const store = storage.getStore()
  if (store) store.user.locale = locale
}
