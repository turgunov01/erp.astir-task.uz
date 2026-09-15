export interface FilterOption {
  value: string
  label: string
}

/**
 * Options for a filter dropdown above a table.
 *
 * The create/edit panel already loads selects from the same endpoints, but it
 * only does so once a form opens. A filter bar has to be populated before the
 * user touches anything, so this fetches during SSR and the page arrives with
 * its dropdowns already filled instead of blank for a frame.
 */
export function useFilterOptions<T extends { id: string }>(
  url: string,
  toLabel: (row: T) => string
) {
  const { data } = useFetch<{ data: T[] }>(url, {
    query: { limit: 100 },
    credentials: 'include',
    default: () => ({ data: [] })
  })

  return computed<FilterOption[]>(() =>
    (data.value?.data ?? []).map(row => ({ value: row.id, label: toLabel(row) }))
  )
}
