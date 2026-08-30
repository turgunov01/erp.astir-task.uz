<script setup lang="ts">
import { useTaskPanels } from '~/composables/useTaskPanels'

useHead({ title: 'Календарь — Aster ERP' })

const { openTask } = useTaskPanels()

interface CalendarTask {
  id: string
  title: string
  deadline: string
  status: string
  priority: string
  project: { id: string, code: string } | null
  assignee: { id: string, firstName: string, lastName: string } | null
}

interface CalendarMilestone {
  id: string
  name: string
  dueDate: string
  completedAt: string | null
  project: { id: string, code: string } | null
}

interface CalendarProject {
  id: string
  code: string
  name: string
  deadline: string
  status: string
}

/** Month being displayed, as an offset from the current one. */
const monthOffset = ref(0)

const viewDate = computed(() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + monthOffset.value, 1)
})

const range = computed(() => {
  const start = viewDate.value
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
  }
})

const { data, pending, error, refresh } = await useFetch<{
  data: {
    projects: CalendarProject[]
    milestones: CalendarMilestone[]
    tasks: CalendarTask[]
  }
}>('/api/dashboard/calendar', {
  query: range,
  credentials: 'include',
  default: () => ({ data: { projects: [], milestones: [], tasks: [] } })
})

const payload = computed(() => data.value?.data ?? { projects: [], milestones: [], tasks: [] })

/** Day key in local time, so an event lands on the day the user sees. */
function dayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0')
}

type EventKind = 'project' | 'milestone' | 'task'

interface DayEvent {
  kind: EventKind
  id: string
  label: string
  meta: string
  done: boolean
}

const eventsByDay = computed(() => {
  const map = new Map<string, DayEvent[]>()
  const push = (key: string, event: DayEvent) => {
    map.set(key, [...(map.get(key) ?? []), event])
  }

  for (const project of payload.value.projects) {
    push(dayKey(project.deadline), {
      kind: 'project',
      id: project.id,
      label: project.code + ' · сдача',
      meta: project.name,
      done: project.status === 'COMPLETED'
    })
  }
  for (const milestone of payload.value.milestones) {
    push(dayKey(milestone.dueDate), {
      kind: 'milestone',
      id: milestone.id,
      label: milestone.name,
      meta: milestone.project?.code ?? '',
      done: Boolean(milestone.completedAt)
    })
  }
  for (const task of payload.value.tasks) {
    push(dayKey(task.deadline), {
      kind: 'task',
      id: task.id,
      label: task.title,
      meta: task.project?.code ?? '',
      done: ['DONE', 'APPROVED'].includes(task.status)
    })
  }
  return map
})

/** Six weeks starting on the Monday on or before the first of the month. */
const weeks = computed(() => {
  const first = viewDate.value
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7))

  const cells: Array<{ date: Date, key: string, inMonth: boolean, isToday: boolean }> = []
  const todayKey = dayKey(new Date())

  for (let index = 0; index < 42; index++) {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = dayKey(date)
    cells.push({
      date,
      key,
      inMonth: date.getMonth() === first.getMonth(),
      isToday: key === todayKey
    })
  }
  return cells
})

const KIND_CLASS: Record<EventKind, string> = {
  project: 'bg-destructive/12 text-destructive',
  milestone: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  task: 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const monthLabel = computed(() =>
  viewDate.value.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
)

const totals = computed(() => ({
  projects: payload.value.projects.length,
  milestones: payload.value.milestones.length,
  tasks: payload.value.tasks.length
}))

function openEvent(event: DayEvent) {
  if (event.kind === 'task') openTask(event.id)
  else if (event.kind === 'project') navigateTo('/projects/' + event.id)
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Планирование
      </p>
      <div class="mt-1.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Календарь</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ totals.projects }} сдач проектов · {{ totals.milestones }} вех ·
            {{ totals.tasks }} задач в этом месяце
          </p>
        </div>

        <div class="flex items-center gap-1">
          <button
            type="button"
            class="rounded-md border px-2.5 py-1.5 hover:bg-secondary"
            aria-label="Предыдущий месяц"
            @click="monthOffset--"
          >
            <Icon name="lucide:chevron-left" class="size-4" />
          </button>
          <span class="min-w-44 px-2 text-center text-sm font-medium capitalize">
            {{ monthLabel }}
          </span>
          <button
            type="button"
            class="rounded-md border px-2.5 py-1.5 hover:bg-secondary"
            aria-label="Следующий месяц"
            @click="monthOffset++"
          >
            <Icon name="lucide:chevron-right" class="size-4" />
          </button>
          <button
            v-if="monthOffset !== 0"
            type="button"
            class="ml-1 rounded-md border px-2.5 py-1.5 text-sm hover:bg-secondary"
            @click="monthOffset = 0"
          >
            Сегодня
          </button>
        </div>
      </div>
    </header>

    <div class="mb-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span class="inline-flex items-center gap-1.5">
        <span class="size-2 rounded-sm bg-destructive/60" /> сдача проекта
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="size-2 rounded-sm bg-violet-500/60" /> веха
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="size-2 rounded-sm bg-sky-500/60" /> задача
      </span>
    </div>

    <div
      v-if="error"
      class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center"
    >
      <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
      <p class="mt-3 text-sm">Не удалось загрузить календарь</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <div
      v-else
      class="overflow-hidden rounded-xl border bg-card"
      :class="pending ? 'opacity-60' : ''"
    >
      <div class="grid grid-cols-7 border-b bg-muted/30">
        <div
          v-for="day in WEEKDAYS"
          :key="day"
          class="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          {{ day }}
        </div>
      </div>

      <div class="grid grid-cols-7">
        <div
          v-for="cell in weeks"
          :key="cell.key"
          class="min-h-28 border-b border-r p-1.5"
          :class="[
            cell.inMonth ? '' : 'bg-muted/20',
            cell.isToday ? 'ring-1 ring-inset ring-ring' : ''
          ]"
        >
          <p
            class="px-0.5 text-xs tabular-nums"
            :class="cell.inMonth ? 'text-foreground' : 'text-muted-foreground/60'"
          >
            {{ cell.date.getDate() }}
          </p>

          <ul class="mt-1 space-y-1">
            <li
              v-for="event in (eventsByDay.get(cell.key) ?? []).slice(0, 3)"
              :key="event.kind + event.id"
            >
              <button
                type="button"
                class="block w-full truncate rounded px-1.5 py-0.5 text-left text-xs"
                :class="[KIND_CLASS[event.kind], event.done ? 'line-through opacity-60' : '']"
                :title="event.label + (event.meta ? ' · ' + event.meta : '')"
                @click="openEvent(event)"
              >
                {{ event.label }}
              </button>
            </li>
            <li
              v-if="(eventsByDay.get(cell.key) ?? []).length > 3"
              class="px-1.5 text-xs text-muted-foreground"
            >
              ещё {{ (eventsByDay.get(cell.key) ?? []).length - 3 }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
