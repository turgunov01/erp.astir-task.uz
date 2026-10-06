import type { PaginationMeta } from '@astir/types'

export interface ListResponse<T, S = unknown> {
  data: T[]
  meta: PaginationMeta
  /** Figures about every matching row, e.g. per-currency totals. */
  summary?: S
}

/**
 * Paginated list resource.
 *
 * Wraps useFetch so the request runs during SSR with the session cookie
 * forwarded, and re-runs whenever a filter ref changes. Query state is passed
 * in as refs rather than read from the URL here, so pages stay free to mirror
 * their filters into query params (spec 89).
 */
export function useListResource<T, S = unknown>(
  path: string,
  filters: Ref<Record<string, string | number | undefined>>
) {
  const { data, pending, error, refresh } = useFetch<ListResponse<T, S>>(path, {
    query: filters,
    credentials: 'include',
    watch: [filters],
    default: () => ({
      data: [],
      meta: { page: 1, limit: 20, total: 0, pages: 0 }
    })
  })

  const items = computed(() => data.value?.data ?? [])
  const meta = computed(
    () => data.value?.meta ?? { page: 1, limit: 20, total: 0, pages: 0 }
  )

  const summary = computed(() => data.value?.summary)

  const errorMessage = computed(() => {
    if (!error.value) return ''
    return apiErrorMessage(error.value, translate('common.errors.loadFailed'))
  })

  return { items, meta, summary, pending, error, errorMessage, refresh }
}

/** Fire a write request and surface the API error message unchanged. */
export async function apiRequest<T>(
  path: string,
  options: Parameters<typeof $fetch>[1] = {}
): Promise<T> {
  return $fetch<T>(path, { credentials: 'include', ...options })
}

/**
 * Codes the client words itself, whatever the server said.
 *
 * FORBIDDEN is always the same short sentence: the server's text can name a
 * permission or a rule the user cannot act on. That is why a message the
 * user must actually read is thrown as badRequest on the API, never forbidden().
 * The others cover answers that may not come from our API at all (a proxy, a
 * dropped connection) and so may not be in the user's language.
 */
const CLIENT_WORDED: Record<string, string> = {
  SERVICE_UNAVAILABLE: 'common.errors.serviceUnavailable',
  FORBIDDEN: 'common.errors.forbidden',
  RATE_LIMITED: 'common.errors.rateLimited',
  INTERNAL_ERROR: 'common.errors.internal'
}

interface ApiErrorBody {
  code?: string
  message?: string
  details?: Record<string, string[]>
}

/** The error envelope (spec 67) from a failed request, when the API sent one. */
export function apiErrorBody(err: unknown): ApiErrorBody | undefined {
  return (err as { data?: { error?: ApiErrorBody } })?.data?.error
}

/**
 * What to tell the user about a failed request.
 *
 * The API words its messages in the language of the request (the
 * astir_locale cookie / Accept-Language / the account's language), so its
 * message is shown as it is. Without an API envelope — the network failed,
 * a proxy answered — the caller's fallback is shown, worded by the caller.
 */
export function apiErrorMessage(err: unknown, fallback?: string): string {
  const body = apiErrorBody(err)
  const code = body?.code
  if (code && CLIENT_WORDED[code]) return translate(CLIENT_WORDED[code] as string)
  const message = body?.message?.trim()
  return message || fallback || translate('common.errors.generic')
}
