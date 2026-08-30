<script setup lang="ts">
import { PRIORITY } from '@astir/types'
import { useTaskPanels } from '~/composables/useTaskPanels'

useHead({ title: 'Calendar — Aster ERP' })

const route = useRoute()
const router = useRouter()

const projectId = ref(String(route.query.projectId ?? ''))
const assigneeId = ref(String(route.query.assigneeId ?? ''))
const priority = ref(String(route.query.priority ?? ''))

/** Month cursor, kept in the URL so a month view is shareable. */
const cursor = ref((() => {
  const raw = String(route.query.month ?? '')
  const parsed = raw ? new Date(raw + '-01T00:00:00') : new Date()
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
})())

const monthKey = computed(() => {
  const year = cursor.value.getFullYear()
  const month = String(cursor.value.getMonth() + 1).padStart(2, '0')
  return year + '-' + month
})

watch([monthKey, projectId, assigneeId, priority], () => {
  const query: Record<string, string> = { month: monthKey.value }
  if (projectId.value) query.projectId = projectId.value
  if (assigneeId.value) query.assigneeId = assigneeId.value
  if (priority.value) query.priority = priority.value
  router.replace({ query })
})

interface Task {
  id: string
  title: string
  status: string
  priority: string
  deadline: string | null
  project: { id: string, code: string } | null
  assignee: { id: string, firstName: string, lastName: string } | null
}

const { data, pending, error, refresh } = await useFetch<{ data: Task[] }>('/api/tasks', {
  query: computed(() => ({
    limit: 100,
    projectId: projectId.value || undefined,
    assigneeId: assigneeId.value || undefined,
    priority: priority.value || undefined
  })),
  credentials: 'include',
  default: () => ({ data: [] })
})

const tasks = computed(() => data.value?.data ?? [])

const { openTask, openDay } = useTaskPanels()

/** Opening a day carries the active filters, so the list matches the grid. */
function showDay(date: string) {
  openDay({
    date,
    projectId: projectId.value || undefined,
    assigneeId: assigneeId.value || undefined,
    priority: priority.value || undefined
  })
}

const { data: projectData } = await useFetch<{ data: Array<{ id: string, code: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const { data: staffData } = await useFetch<{
  data: Array<{ userId: string, user: { firstName: string, lastName: string } }>
}>('/api/employees', { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) })

const projects = computed(() => projectData.value?.data ?? [])
const staff = computed(() => staffData.value?.data ?? [])

const PRIORITIES = Object.values(PRIORITY)

function dayKey(date: Date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0')
}

/** Tasks bucketed by deadline day, so each cell is one lookup. */
const byDay = computed(() => {
  const map = new Map<string, Task[]>()
  for (const task of tasks.value) {
    if (!task.deadline) continue
    const key = dayKey(new Date(task.deadline))
    map.set(key, [...(map.get(key) ?? []), task])
  }
  return map
})

/** Six-week grid starting on Monday, so every month lays out identically. */
const weeks = computed(() => {
  const first = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - offset)

  const result: Array<Array<{ date: Date, inMonth: boolean, key: string }>> = []
  const cell = new Date(start)

  for (let week = 0; week < 6; week += 1) {
    const row: Array<{ date: Date, inMonth: boolean, key: string }> = []
    for (let day = 0; day < 7; day += 1) {
      row.push({
        date: new Date(cell),
        inMonth: cell.getMonth() === cursor.value.getMonth(),
        key: dayKey(cell)
      })
      cell.setDate(cell.getDate() + 1)
    }
    result.push(row)
  }
  return result
})

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const monthLabel = computed(() =>
  cursor.value.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
)

const todayKey = dayKey(new Date())

const scheduled = computed(() => tasks.value.filter(task => task.deadline).length)
const unscheduled = computed(() => tasks.value.filter(task => !task.deadline).length)

function shiftMonth(delta: number) {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1)
}

function goToday() {
  cursor.value = new Date()
}

function priorityDot(value: string) {
  if (value === 'URGENT') return 'bg-destructive'
  if (value === 'HIGH') return 'bg-signal'
  if (value === 'NORMAL') return 'bg-primary'
  return 'bg-muted-foreground/40'
}

function isOverdue(task: Task) {
  return Boolean(task.deadline) &&
    new Date(task.deadline as string) < new Date() &&
    !['DONE', 'APPROVED'].includes(task.status)
}
</script>

<template>
  <div class="mx-auto max-w-[1500px] px-6 py-8">
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Production
        </p>
        <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Календарь дедлайнов</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ scheduled }} с дедлайном
          <span v-if="unscheduled > 0">· {{ unscheduled }} без даты</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink
          to="/tasks"
          class="inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm hover:bg-secondary"
        >
          <Icon name="lucide:list" class="size-4" />
          Список
        </NuxtLink>
        <NuxtLink
          to="/tasks/board"
          class="inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm hover:bg-secondary"
        >
          <Icon name="lucide:columns-3" class="size-4" />
          Доска
        </NuxtLink>
      </div>
    </header>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="grid size-9 place-items-center rounded-md border hover:bg-secondary"
          aria-label="Предыдущий месяц"
          @click="shiftMonth(-1)"
        >
          <Icon name="lucide:chevron-left" class="size-4" />
        </button>
        <button
          type="button"
          class="h-9 rounded-md border px-3 text-sm hover:bg-secondary"
          @click="goToday"
        >
          Сегодня
        </button>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-md border hover:bg-secondary"
          aria-label="Следующий месяц"
          @click="shiftMonth(1)"
        >
          <Icon name="lucide:chevron-right" class="size-4" />
        </button>
        <p class="ml-2 text-sm font-medium capitalize">{{ monthLabel }}</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по проекту"
        >
          <option value="">Все проекты</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.code }}</option>
        </select>
        <select
          v-model="assigneeId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по исполнителю"
        >
          <option value="">Все исполнители</option>
          <option v-for="s in staff" :key="s.userId" :value="s.userId">
            {{ s.user.firstName }} {{ s.user.lastName }}
          </option>
        </select>
        <select
          v-model="priority"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по приоритету"
        >
          <option value="">Любой приоритет</option>
          <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>
    </div>

    <div v-if="error" class="rounded-xl border bg-card px-6 py-16 text-center">
      <p class="text-sm text-muted-foreground">Не удалось загрузить календарь</p>
      <button
        type="button"
        class="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <div v-else class="overflow-hidden rounded-xl border bg-card">
      <div class="grid grid-cols-7 border-b bg-muted/30">
        <div
          v-for="day in WEEKDAYS"
          :key="day"
          class="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          {{ day }}
        </div>
      </div>

      <div v-if="pending && tasks.length === 0" class="grid grid-cols-7">
        <div v-for="n in 35" :key="n" class="min-h-24 border-b border-r p-2">
          <div class="h-3 w-6 rounded bg-muted" />
        </div>
      </div>

      <div v-else class="grid grid-cols-7">
        <template v-for="(week, weekIndex) in weeks" :key="weekIndex">
          <!--
            The whole cell is the hit target when the day has tasks: a 6mm
            date number is a poor thing to aim at. Task entries inside stop
            propagation so they open their own task, not the day list.
          -->
          <div
            v-for="cell in week"
            :key="cell.key"
            class="min-h-28 border-b border-r p-2 text-left last:border-r-0"
            :class="[ cell.inMonth ? '' : 'bg-muted/20', (byDay.get(cell.key)?.length ?? 0) > 0 ? 'cursor-pointer hover:bg-secondary/50' : '' ]"
            :role="(byDay.get(cell.key)?.length ?? 0) > 0 ? 'button' : undefined"
            :tabindex="(byDay.get(cell.key)?.length ?? 0) > 0 ? 0 : undefined"
            :aria-label="(byDay.get(cell.key)?.length ?? 0) > 0
              ? 'Задачи на ' + cell.key + ': ' + (byDay.get(cell.key)?.length ?? 0)
              : undefined"
            @click="(byDay.get(cell.key)?.length ?? 0) > 0 && showDay(cell.key)"
            @keydown.enter.prevent="(byDay.get(cell.key)?.length ?? 0) > 0 && showDay(cell.key)"
            @keydown.space.prevent="(byDay.get(cell.key)?.length ?? 0) > 0 && showDay(cell.key)"
          >
            <div class="flex items-center justify-between">
              <span
                class="grid size-6 place-items-center rounded-full text-xs tabular-nums"
                :class="cell.key === todayKey ? 'bg-primary font-medium text-primary-foreground' : cell.inMonth ? 'text-foreground' : 'text-muted-foreground/50'"
              >
                {{ cell.date.getDate() }}
              </span>
              <span
                v-if="(byDay.get(cell.key)?.length ?? 0) > 0"
                class="rounded bg-secondary px-1 text-[10px] tabular-nums text-muted-foreground"
              >
                {{ byDay.get(cell.key)?.length }}
              </span>
            </div>

            <ul class="mt-1.5 space-y-1">
              <li v-for="task in (byDay.get(cell.key) ?? []).slice(0, 3)" :key="task.id">
                <button
                  type="button"
                  class="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-[11px] leading-snug hover:bg-secondary"
                  :class="isOverdue(task) ? 'text-destructive' : ''"
                  @click.stop="openTask(task.id)"
                >
                  <span class="mt-1 size-1.5 shrink-0 rounded-full" :class="priorityDot(task.priority)" />
                  <span class="line-clamp-2">{{ task.title }}</span>
                </button>
              </li>
              <li
                v-if="(byDay.get(cell.key)?.length ?? 0) > 3"
                class="px-1 text-[10px] text-muted-foreground"
              >
                ещё {{ (byDay.get(cell.key)?.length ?? 0) - 3 }}
              </li>
            </ul>
          </div>
        </template>
      </div>
    </div>

    <p class="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span class="inline-flex items-center gap-1.5">
        <span class="size-1.5 rounded-full bg-destructive" /> Urgent
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="size-1.5 rounded-full bg-signal" /> High
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="size-1.5 rounded-full bg-primary" /> Normal
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="size-1.5 rounded-full bg-muted-foreground/40" /> Low
      </span>
    </p>
  </div>
</template>
