import { defineStore } from 'pinia'
import { appendResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import type { AuthUser, Permission } from '@astir/types'

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

  async function login(email: string, password: string) {
    pending.value = true
    try {
      const response = await $fetch<{ data: SessionPayload }>('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      })
      apply(response.data)
      initialized.value = true
      return response.data.user
    } finally {
      pending.value = false
    }
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
    can,
    init,
    login,
    logout
  }
})
