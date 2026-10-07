import { defineStore } from 'pinia'
import { appendResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { PERMISSION, ROLE, type AuthUser, type Permission } from '@astir/types'

interface SessionPayload {
  user: AuthUser
  permissions: Permission[]
}

/**
 * Session state.
 *
 * Tokens live in httpOnly cookies and are never read by JS; this store only
 * mirrors who the user is and what they may do, so the sidebar and route
 * guards can react without another round trip.
 */

/** Replace or append name=value pairs on the incoming request cookie header. */
function mergeRequestCookies(event: H3Event, pairs: string[]): void {
  const current = event.node.req.headers.cookie ?? ''
  const jar = new Map<string, string>()

  for (const entry of current.split(';')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq > 0) jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1))
  }

  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1))
  }

  event.node.req.headers.cookie = [...jar.entries()]
    .map(([name, value]) => name + '=' + value)
    .join('; ')
}

/** The personal task list, where every employee starts. */
export const MY_TASKS_PATH = '/tasks/my'

/** The attendance board, where the owner and the administrator start. */
export const ATTENDANCE_PATH = '/team/attendance'

/**
 * Pages a session without tasks or a dashboard (a client account) can open,
 * in the order it should land on them. Each is scoped server-side to the
 * caller's own client.
 */
const PORTAL_PAGES: ReadonlyArray<{ path: string, permission: Permission }> = [
  { path: '/projects', permission: PERMISSION.PROJECT_VIEW },
  { path: '/reviews', permission: PERMISSION.REVIEW_VIEW },
  { path: '/documents', permission: PERMISSION.DOCUMENT_VIEW }
]

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const permissions = ref<Permission[]>([])
  const initialized = ref(false)
  const pending = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const fullName = computed(() =>
    user.value ? user.value.firstName + ' ' + user.value.lastName : ''
  )
  const initials = computed(() =>
    user.value
      ? (user.value.firstName.charAt(0) + user.value.lastName.charAt(0)).toUpperCase()
      : ''
  )

  function apply(payload: SessionPayload | null) {
    user.value = payload?.user ?? null
    permissions.value = payload?.permissions ?? []
  }

  /** True when the current role carries the permission (spec 6, 99). */
  function can(permission: Permission): boolean {
    return permissions.value.includes(permission)
  }

  /**
   * Where this session starts: after sign-in, on `/` and when a signed-in
   * user opens a guest page. A `?redirect=` on the login page still wins.
   *
   * The client's rule, literally: the owner and the administrator start on
   * the attendance board; every employee starts on their own tasks.
   * Each step also checks the page can actually be opened, so an edited role
   * matrix degrades to the next sensible page instead of a 403 — and client
   * accounts, which have neither, land in their portal.
   */
  const homePath = computed(() => {
    const role = user.value?.role
    const oversees = role === ROLE.OWNER || role === ROLE.ADMIN
    if (oversees && can(PERMISSION.ATTENDANCE_VIEW)) return ATTENDANCE_PATH
    if (can(PERMISSION.TASK_VIEW_OWN)) return MY_TASKS_PATH
    if (can(PERMISSION.DASHBOARD_VIEW)) return '/dashboard'
    const portal = PORTAL_PAGES.find(page => can(page.permission))
    return portal ? portal.path : '/profile'
  })

  /**
   * Resolve the session once per app load. Uses useRequestFetch on the server
   * so the incoming cookie header is forwarded to the proxied API.
   */
  /**
   * Resolve the session once per app load.
   *
   * The access token lives 15 minutes while the refresh token lives 30 days,
   * so a plain /me failure is usually just an expired access token, not a
   * logged-out user. One refresh is attempted before giving up, otherwise a
   * page load 15 minutes after signing in would bounce to /login.
   *
   * During SSR the refreshed Set-Cookie headers are forwarded to the browser,
   * so the rotated tokens survive the response instead of being dropped.
   */
  async function init() {
    if (initialized.value) return
    const request = useRequestFetch()
    const event = import.meta.server ? useRequestEvent() : null

    try {
      const response = await request<{ data: SessionPayload }>('/api/auth/me')
      apply(response.data)
    } catch {
      try {
        const refreshed = await request<{ data: SessionPayload }>('/api/auth/refresh', {
          method: 'POST',
          onResponse({ response }) {
            if (!event) return
            const cookies = response.headers.getSetCookie?.() ?? []
            for (const cookie of cookies) {
              appendResponseHeader(event, 'set-cookie', cookie)
            }
            // useRequestFetch replays the *incoming* cookie header, so later
            // SSR fetches on this same request would still send the expired
            // token. Rewrite it in place with the rotated pair.
            const rotated = cookies.map(cookie => cookie.split(';')[0] ?? '').filter(Boolean)
            if (rotated.length > 0) {
              mergeRequestCookies(event, rotated)
            }
          }
        })
        apply(refreshed.data)
      } catch {
        apply(null)
      }
    } finally {
      initialized.value = true
    }
  }

  /**
   * Re-read the session after the account itself changed.
   *
   * init() deliberately runs once per page load; this is the other case — the
   * user edited their own name, and the header is still showing the old one.
   */
  async function refresh() {
    try {
      const response = await $fetch<{ data: SessionPayload }>('/api/auth/me', {
        credentials: 'include'
      })
      apply(response.data)
    } catch {
      // A failed refresh leaves the previous session in place: the account is
      // still valid, the header is merely a few seconds stale.
    }
  }

  /** Post credentials and adopt the session the API answers with. */
  async function establish(path: string, body: Record<string, string>) {
    pending.value = true
    try {
      const response = await $fetch<{ data: SessionPayload }>(path, { method: 'POST', body })
      apply(response.data)
      initialized.value = true
      return response.data.user
    } finally {
      pending.value = false
    }
  }

  function login(email: string, password: string) {
    return establish('/api/auth/login', { email, password })
  }

  /**
   * Finish a login the API stopped for email verification.
   *
   * The password travels again on purpose: the API re-checks it, so a code
   * on its own never opens an account.
   */
  function verifyCode(email: string, password: string, code: string) {
    return establish('/api/auth/verify-code', { email, password, code })
  }

  /** Replace a password a manager set; the session carries on with the new one. */
  async function setPassword(password: string) {
    const response = await $fetch<{ data: SessionPayload }>('/api/auth/set-password', {
      method: 'POST',
      body: { password },
      credentials: 'include'
    })
    apply(response.data)
  }

  /** Ask for another code; resolves to the seconds until the next one may be sent. */
  async function resendCode(email: string): Promise<number> {
    const response = await $fetch<{ data: { retryAfter: number } }>('/api/auth/resend-code', {
      method: 'POST',
      body: { email }
    })
    return response.data.retryAfter
  }

  async function logout() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      apply(null)
      await navigateTo('/login')
    }
  }

  return {
    user,
    permissions,
    initialized,
    pending,
    isAuthenticated,
    fullName,
    initials,
    homePath,
    can,
    init,
    refresh,
    login,
    verifyCode,
    setPassword,
    resendCode,
    logout
  }
})
