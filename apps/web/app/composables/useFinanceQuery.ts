import { resolvePeriod, type ResolvedPeriod } from '~/utils/finance-period'

/**
 * Filters of a finance page, kept in the URL (spec 89).
 *
 * A filtered ledger is something people send each other — "unpaid som
 * invoices for October" has to survive being pasted into a chat — so every
 * filter, the period and the page live in the query string.
 */
export function useFinanceQuery<K extends string>(keys: readonly K[], periodFallback: string) {
  const route = useRoute()
  const router = useRouter()

  const read = (key: string) => {
    const value = route.query[key]
    return typeof value === 'string' ? value : ''
  }

  const filters = reactive(Object.fromEntries(keys.map(key => [key, read(key)]))) as Record<K, string>
  const periodKey = ref(read('period') || periodFallback)
  const customFrom = ref(read('from'))
  const customTo = ref(read('to'))
  const page = ref(Math.max(1, Number(read('page')) || 1))

  const period = computed<ResolvedPeriod>(() =>
    resolvePeriod(periodKey.value, customFrom.value, customTo.value, periodFallback))

  function setPeriod(key: string, from = '', to = '') {
    periodKey.value = key
    customFrom.value = key === 'custom' ? from : ''
    customTo.value = key === 'custom' ? to : ''
  }

  // Narrowing anything re-reads from page one, or the table looks empty.
  watch([() => ({ ...filters }), period], () => { page.value = 1 }, { deep: true })

  watch([() => ({ ...filters }), periodKey, customFrom, customTo, page], () => {
    const query: Record<string, string | undefined> = {}
    for (const key of keys) query[key] = filters[key] || undefined
    query.period = periodKey.value === periodFallback ? undefined : periodKey.value
    query.from = periodKey.value === 'custom' ? customFrom.value || undefined : undefined
    query.to = periodKey.value === 'custom' ? customTo.value || undefined : undefined
    query.page = page.value > 1 ? String(page.value) : undefined
    router.replace({ query })
  }, { deep: true })

  /** What the API receives: the filters plus concrete day bounds. */
  const apiQuery = computed(() => {
    const query: Record<string, string | undefined> = {}
    for (const key of keys) query[key] = filters[key] || undefined
    query.from = period.value.from || undefined
    query.to = period.value.to || undefined
    return query
  })

  const isFiltered = computed(() =>
    keys.some(key => Boolean(filters[key])) || periodKey.value !== periodFallback)

  function reset() {
    for (const key of keys) filters[key] = ''
    setPeriod(periodFallback)
  }

  /*
   * The table's search box reports every keystroke; the `search` filter (and
   * the URL) take the text once typing pauses.
   */
  const searchKey = 'search' as K
  const searchDraft = ref(filters[searchKey] ?? '')
  const commitSearch = useDebounceFn((value: string) => { filters[searchKey] = value.trim() }, 300)
  function onSearch(value: string) {
    searchDraft.value = value
    void commitSearch(value)
  }
  watch(() => filters[searchKey], value => {
    if ((value ?? '') !== searchDraft.value.trim()) searchDraft.value = value ?? ''
  })

  return {
    filters, period, periodKey, setPeriod, page, apiQuery, isFiltered, reset,
    searchDraft, onSearch
  }
}

/** Link to the CSV export of a list with the filters on screen. */
export function financeCsvHref(path: string, query: Record<string, string | undefined>) {
  const search = new URLSearchParams({ format: 'csv' })
  for (const [key, value] of Object.entries(query)) {
    if (value) search.set(key, value)
  }
  return path + '?' + search.toString()
}
