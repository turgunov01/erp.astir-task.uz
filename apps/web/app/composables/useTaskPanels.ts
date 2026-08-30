/**
 * Stack of right-hand panels.
 *
 * Panels stack instead of replacing each other: opening a task from inside the
 * day list keeps the day list behind it, so closing the task returns you to
 * where you were rather than to the page. Escape and the backdrop close only
 * the topmost panel.
 */
export interface TaskPanel {
  kind: 'task'
  id: string
}

export interface DayPanel {
  kind: 'day'
  /** yyyy-mm-dd, matching the calendar cell key. */
  date: string
  /** Filters carried over from the calendar so the list matches what was shown. */
  projectId?: string
  assigneeId?: string
  priority?: string
}

export interface StatusPanel {
  kind: 'status'
  /** Board column this was opened from. */
  status: string
  /** Carried over from the board so the list matches the column. */
  projectId?: string
}

export interface ReviewPanel {
  kind: 'review'
  id: string
}

/** Detail panels that carry only an id: the panel fetches the rest. */
export interface EntityPanel {
  kind: 'revision' | 'render' | 'asset'
  id: string
}

export type Panel = TaskPanel | DayPanel | StatusPanel | ReviewPanel | EntityPanel

/** Panels beyond this depth stop being useful and just cost memory. */
const MAX_DEPTH = 4

export function useTaskPanels() {
  const stack = useState<Panel[]>('task-panel-stack', () => [])

  function openTask(id: string) {
    const top = stack.value[stack.value.length - 1]
    // Re-clicking the task already on top is a no-op, not a duplicate layer.
    if (top && top.kind === 'task' && top.id === id) return
    const next: TaskPanel = { kind: 'task', id }
    stack.value = [...stack.value, next].slice(-MAX_DEPTH)
  }

  function openDay(panel: Omit<DayPanel, 'kind'>) {
    const top = stack.value[stack.value.length - 1]
    if (top && top.kind === 'day' && top.date === panel.date) return
    const next: DayPanel = { kind: 'day', ...panel }
    stack.value = [...stack.value, next].slice(-MAX_DEPTH)
  }

  function openStatus(panel: Omit<StatusPanel, 'kind'>) {
    const top = stack.value[stack.value.length - 1]
    if (top && top.kind === 'status' && top.status === panel.status) return
    const next: StatusPanel = { kind: 'status', ...panel }
    stack.value = [...stack.value, next].slice(-MAX_DEPTH)
  }

  function openReview(id: string) {
    const top = stack.value[stack.value.length - 1]
    if (top && top.kind === 'review' && top.id === id) return
    const next: ReviewPanel = { kind: 'review', id }
    stack.value = [...stack.value, next].slice(-MAX_DEPTH)
  }

  /** Open any id-addressed detail panel: revision, render job or asset. */
  function openEntity(kind: EntityPanel['kind'], id: string) {
    const top = stack.value[stack.value.length - 1]
    if (top && top.kind === kind && 'id' in top && top.id === id) return
    const next: EntityPanel = { kind, id }
    stack.value = [...stack.value, next].slice(-MAX_DEPTH)
  }

  /** Close the topmost panel only. */
  function closeTop() {
    stack.value = stack.value.slice(0, -1)
  }

  function closeAll() {
    stack.value = []
  }

  /** Replace the whole stack, used when a deep link seeds it on page load. */
  function setStack(panels: Panel[]) {
    stack.value = panels.slice(-MAX_DEPTH)
  }

  const isOpen = computed(() => stack.value.length > 0)
  const depth = computed(() => stack.value.length)

  return {
    stack, openTask, openDay, openStatus, openReview, openEntity,
    closeTop, closeAll, setStack, isOpen, depth
  }
}
