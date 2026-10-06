import type { ViewerItem } from '~/utils/media'

interface ViewerState {
  items: ViewerItem[]
  index: number
  open: boolean
}

/**
 * The one file viewer the whole app opens.
 *
 * A single <MediaViewer> lives in the layout and reads this state, so a task
 * drawer, a review, the document library and a project's files all open the
 * same lightbox by handing it the list the user is looking at.
 */
export function useMediaViewer() {
  const state = useState<ViewerState>('media-viewer', () => ({ items: [], index: 0, open: false }))

  const items = computed(() => state.value.items)
  const index = computed(() => state.value.index)
  const isOpen = computed(() => state.value.open && state.value.items.length > 0)
  const current = computed<ViewerItem | undefined>(() => state.value.items[state.value.index])

  /** Opens on the given item, by position or by id; unknown ids start at the first. */
  function open(list: ViewerItem[], start: number | string = 0) {
    const usable = list.filter(item => Boolean(safeMediaUrl(item.url)))
    if (usable.length === 0) return
    const position = typeof start === 'string'
      ? Math.max(0, usable.findIndex(item => item.id === start))
      : Math.min(Math.max(0, start), usable.length - 1)
    state.value = { items: usable, index: position, open: true }
  }

  function close() {
    state.value = { ...state.value, open: false }
  }

  function select(position: number) {
    const count = state.value.items.length
    if (count === 0) return
    state.value = { ...state.value, index: Math.min(Math.max(0, position), count - 1) }
  }

  /** Wraps around, so the arrows never dead-end on the first or last item. */
  function step(delta: number) {
    const count = state.value.items.length
    if (count === 0) return
    select((state.value.index + delta + count) % count)
  }

  return { items, index, isOpen, current, open, close, select, step }
}
