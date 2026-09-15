/**
 * Shared plumbing for the report pages: the period, and the export link.
 */

/** Query a report page sends to the API and mirrors into its URL. */
export type ReportQuery = Record<string, string | undefined>

/**
 * The reporting period, kept in the URL.
 *
 * A report is something people send each other — "look at October" has to
 * survive being pasted into a chat, so the dates live in the query string
 * rather than in component state (spec 89).
 */
export function useReportPeriod() {
  const route = useRoute()
  const router = useRouter()

  const from = ref(String(route.query.from ?? ''))
  const to = ref(String(route.query.to ?? ''))

  watch([from, to], () => {
    router.replace({
      query: {
        ...route.query,
        from: from.value || undefined,
        to: to.value || undefined
      }
    })
  })

  /** Only the keys that carry a value, so the URL stays readable. */
  const params = computed<ReportQuery>(() => ({
    from: from.value || undefined,
    to: to.value || undefined
  }))

  function reset() {
    from.value = ''
    to.value = ''
  }

  const isFiltered = computed(() => Boolean(from.value || to.value))

  return { from, to, params, reset, isFiltered }
}

/**
 * Href for a CSV export.
 *
 * A plain link, not a fetch: the request carries the session cookie on its own
 * and the browser handles the attachment, so nothing has to be assembled into a
 * blob in memory or revoked afterwards.
 */
export function reportCsvHref(path: string, query: ReportQuery) {
  const search = new URLSearchParams({ format: 'csv' })
  for (const [key, value] of Object.entries(query)) {
    if (value) search.set(key, value)
  }
  return path + '?' + search.toString()
}

/**
 * Hand the page to the browser's print dialogue.
 *
 * Guarded because the report pages render on the server too, where there is no
 * window and no printer, and an unguarded call would break hydration.
 */
export function printReport() {
  if (import.meta.client) window.print()
}
