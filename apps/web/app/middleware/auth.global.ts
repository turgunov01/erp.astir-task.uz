import { PERMISSION, type Permission } from '@astir/types'
import type { Pinia } from 'pinia'
import { useAuthStore } from '~/stores/auth'

/** Routes reachable without a session (spec 5). */
const GUEST_ROUTES = new Set(['/login', '/forgot-password', '/reset-password'])

/**
 * Route to permission map (spec 78).
 *
 * Hiding a sidebar entry is presentation, not access control: without this a
 * user could still reach the URL directly. Longest matching prefix wins.
 */
const ROUTE_PERMISSIONS: ReadonlyArray<[string, Permission]> = [
  ['/dashboard', PERMISSION.DASHBOARD_VIEW],
  ['/projects', PERMISSION.PROJECT_VIEW],
  ['/episodes', PERMISSION.PRODUCTION_VIEW],
  ['/scenes', PERMISSION.PRODUCTION_VIEW],
  ['/shots', PERMISSION.PRODUCTION_VIEW],
  ['/tasks', PERMISSION.TASK_VIEW_OWN],
  ['/reviews', PERMISSION.REVIEW_VIEW],
  ['/revisions', PERMISSION.REVISION_VIEW],
  ['/render', PERMISSION.RENDER_VIEW],
  ['/assets', PERMISSION.ASSET_VIEW],
  ['/calendar', PERMISSION.PRODUCTION_VIEW],
  ['/team', PERMISSION.TEAM_VIEW],
  ['/timesheets', PERMISSION.TIMESHEET_VIEW_OWN],
  ['/clients', PERMISSION.CLIENT_VIEW],
  ['/finance', PERMISSION.FINANCE_VIEW],
  ['/reports', PERMISSION.REPORT_VIEW],
  ['/documents', PERMISSION.DOCUMENT_VIEW],
  ['/activity', PERMISSION.ACTIVITY_VIEW],
  ['/settings', PERMISSION.SETTINGS_VIEW]
]

function requiredPermission(pathname: string): Permission | null {
  let match: [string, Permission] | null = null
  for (const entry of ROUTE_PERMISSIONS) {
    const prefix = entry[0]
    const matches = pathname === prefix || pathname.startsWith(prefix + '/')
    if (matches && (!match || prefix.length > match[0].length)) match = entry
  }
  return match ? match[1] : null
}

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

  if (auth.isAuthenticated && isGuestRoute) {
    return navigateTo('/dashboard')
  }

  if (auth.isAuthenticated) {
    const permission = requiredPermission(to.path)
    if (permission && !auth.can(permission)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'У вас нет доступа к этому разделу'
      })
    }
  }
})
