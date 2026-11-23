import type { Pinia } from 'pinia'
import { useAuthStore } from '~/stores/auth'
import { requiredPermission } from '~/utils/route-access'

/** Routes reachable without a session (spec 5). */
const GUEST_ROUTES = new Set(['/login', '/forgot-password', '/reset-password'])

/**
 * Guest routes that a signed-in person may still open: a reset link from the
 * mailbox must work even in a browser that holds a session, rather than
 * silently bouncing to the dashboard.
 */
const OPEN_TO_EVERYONE = new Set(['/reset-password'])

/** Where a session holding a manager-set password must stop first. */
const SET_PASSWORD_PATH = '/set-password'

/**
 * Runs on server and client, so a direct SSR hit to a protected URL redirects
 * before any private markup is rendered rather than flashing it.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // Global middleware runs from the router plugin, which on the client can
  // execute before the Pinia plugin has installed itself — notably when the
  // server returned an error page. Resolving the store against the app own
  // pinia instance avoids depending on an ambient "active" one.
  const auth = useAuthStore(useNuxtApp().$pinia as Pinia)
  await auth.init()

  const isGuestRoute = GUEST_ROUTES.has(to.path)

  if (!auth.isAuthenticated && !isGuestRoute) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  if (auth.isAuthenticated && isGuestRoute && !OPEN_TO_EVERYONE.has(to.path)) {
    return navigateTo(auth.homePath)
  }

  /*
   * A password a manager set is replaced before anything else opens; the API
   * refuses such a session everything but that step. Once replaced, the step
   * has nothing to offer and sends the person on to work.
   */
  const mustChangePassword = auth.user?.mustChangePassword === true
  if (mustChangePassword && to.path !== SET_PASSWORD_PATH && !OPEN_TO_EVERYONE.has(to.path)) {
    return navigateTo(SET_PASSWORD_PATH)
  }
  if (auth.isAuthenticated && !mustChangePassword && to.path === SET_PASSWORD_PATH) {
    return navigateTo(auth.homePath)
  }

  if (auth.isAuthenticated) {
    const permission = requiredPermission(to.path)
    if (permission && !auth.can(permission)) {
      throw createError({
        statusCode: 403,
        statusMessage: translate('shell.errorPage.forbiddenBody')
      })
    }
  }
})
