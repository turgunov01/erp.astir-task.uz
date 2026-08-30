import type { PaginationMeta } from '@astir/types'

export interface ListResponse<T> {
  data: T[]
  meta: PaginationMeta
}

/**
 * Paginated list resource.
 *
 * Wraps useFetch so the request runs during SSR with the session cookie
 * forwarded, and re-runs whenever a filter ref changes. Query state is passed
 * in as refs rather than read from the URL here, so pages stay free to mirror
 * their filters into query params (spec 89).
 */
export function useListResource<T>(
  path: string,
  filters: Ref<Record<string, string | number | undefined>>
) {
  const { data, pending, error, refresh } = useFetch<ListResponse<T>>(path, {
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

  const errorMessage = computed(() => {
    if (!error.value) return ''
    const body = error.value.data as { error?: { message?: string } } | undefined
    return body?.error?.message ?? 'Не удалось загрузить данные'
  })

  return { items, meta, pending, error, errorMessage, refresh }
}

/** Fire a write request and surface the API error message unchanged. */
export async function apiRequest<T>(
  path: string,
  options: Parameters<typeof $fetch>[1] = {}
): Promise<T> {
  return $fetch<T>(path, { credentials: 'include', ...options })
}

/**
 * Operational failures the user can act on, worded in the interface language.
 *
 * The API answers in English and its wording is aimed at developers; these
 * few codes are the ones a user actually sees, so they get a translation
 * rather than a raw server string.
 */
const ERROR_MESSAGE_RU: Record<string, string> = {
  SERVICE_UNAVAILABLE: 'База данных недоступна. Попробуйте ещё раз, когда соединение восстановится.',
  INVALID_CREDENTIALS: 'Неверный email или пароль',
  UNAUTHENTICATED: 'Сессия истекла, войдите заново',
  FORBIDDEN: 'Недостаточно прав для этого действия',
  RATE_LIMITED: 'Слишком много попыток, подождите немного',
  INTERNAL_ERROR: 'Внутренняя ошибка сервера'
}

export function apiErrorMessage(err: unknown, fallback = 'Что-то пошло не так'): string {
  const body = (err as { data?: { error?: { code?: string, message?: string } } })?.data
  const code = body?.error?.code
  if (code && ERROR_MESSAGE_RU[code]) return ERROR_MESSAGE_RU[code] as string
  return body?.error?.message ?? fallback
}
