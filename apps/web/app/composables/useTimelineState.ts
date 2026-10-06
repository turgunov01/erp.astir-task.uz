import {
  TIMELINE_GROUPS,
  TIMELINE_SCALES,
  TIMELINE_STATUS_ORDER,
  TIMELINE_VIEWS,
  type TimelineGroup,
  type TimelineScale,
  type TimelineView
} from '~/utils/timeline'

/**
 * Every choice on the timeline page lives in the URL query.
 *
 * A configured view — "Gantt of the BRAND project, by assignee, in weeks,
 * only what is in review" — is then a link that can be bookmarked or sent to
 * a colleague, and the back button walks through filter changes. Defaults are
 * left out of the URL so a plain /timeline stays plain.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function pick<T extends string>(raw: unknown, allowed: ReadonlyArray<{ key: T }>): T | null {
  const value = typeof raw === 'string' ? raw : ''
  return allowed.some(item => item.key === value) ? (value as T) : null
}

function day(raw: unknown) {
  return typeof raw === 'string' && ISO_DAY.test(raw) ? raw : ''
}

export function useTimelineState() {
  const route = useRoute()
  const router = useRouter()

  function patch(changes: Record<string, string | undefined>) {
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries({ ...route.query, ...changes })) {
      if (typeof value === 'string' && value !== '') next[key] = value
    }
    router.replace({ query: next })
  }

  /** A writable computed over one query key, '' meaning "absent". */
  function param(key: string, read: (raw: unknown) => string = raw => (typeof raw === 'string' ? raw : '')) {
    return computed({
      get: () => read(route.query[key]),
      set: (value: string) => patch({ [key]: value || undefined })
    })
  }

  const view = computed<TimelineView>({
    get: () => pick(route.query.view, TIMELINE_VIEWS) ?? 'gantt',
    set: value => patch({ view: value === 'gantt' ? undefined : value })
  })

  const projectId = param('projectId')
  const assigneeId = param('assigneeId')
  const from = param('from', day)
  const to = param('to', day)

  /** Only overdue work, the question a producer asks most often. */
  const lateOnly = computed({
    get: () => route.query.late === '1',
    set: (value: boolean) => patch({ late: value ? '1' : undefined })
  })

  const statuses = computed<string[]>({
    get: () => {
      const raw = typeof route.query.status === 'string' ? route.query.status : ''
      const known = TIMELINE_STATUS_ORDER as readonly string[]
      return raw.split(',').filter(item => known.includes(item))
    },
    set: value => patch({ status: value.length > 0 ? value.join(',') : undefined })
  })

  function toggleStatus(status: string) {
    statuses.value = statuses.value.includes(status)
      ? statuses.value.filter(item => item !== status)
      : [...statuses.value, status]
  }

  /**
   * Inside one project the pipeline stage is the natural grouping; across
   * projects it is the project itself.
   */
  const group = computed<TimelineGroup>({
    get: () => pick(route.query.group, TIMELINE_GROUPS) ?? (projectId.value ? 'stage' : 'project'),
    set: value => patch({ group: value })
  })

  /** Explicit scale, or null to let the chart pick one from the date span. */
  const scaleChoice = computed<TimelineScale | null>({
    get: () => pick(route.query.scale, TIMELINE_SCALES),
    set: value => patch({ scale: value ?? undefined })
  })

  const hasFilters = computed(() =>
    Boolean(projectId.value || assigneeId.value || from.value || to.value) ||
    statuses.value.length > 0 || lateOnly.value
  )

  function resetFilters() {
    patch({
      projectId: undefined,
      assigneeId: undefined,
      from: undefined,
      to: undefined,
      status: undefined,
      late: undefined
    })
  }

  /**
   * Query for the API: only what the server filters on.
   *
   * The previous object is handed back while nothing in it changed, so
   * switching view, grouping or scale (which also rewrite the URL) does not
   * look like a new query and refetch the same data.
   */
  const apiQuery = computed<Record<string, string | undefined>>(previous => {
    const next: Record<string, string | undefined> = {
      projectId: projectId.value || undefined,
      assigneeId: assigneeId.value || undefined,
      status: statuses.value.length > 0 ? statuses.value.join(',') : undefined,
      from: from.value ? from.value + 'T00:00:00' : undefined,
      to: to.value ? to.value + 'T23:59:59' : undefined
    }
    const same = previous && Object.keys(next).every(key => previous[key] === next[key])
    return same ? previous : next
  })

  return {
    view,
    projectId,
    assigneeId,
    from,
    to,
    lateOnly,
    statuses,
    toggleStatus,
    group,
    scaleChoice,
    hasFilters,
    resetFilters,
    apiQuery
  }
}
