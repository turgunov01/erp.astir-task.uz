<script setup lang="ts">
import { useTimelineState } from '~/composables/useTimelineState'
import { useTaskPanels } from '~/composables/useTaskPanels'
import {
  TIMELINE_GROUPS,
  TIMELINE_SCALES,
  TIMELINE_STATUS_ORDER,
  TIMELINE_VIEWS,
  daysBetween,
  isLate,
  personName,
  startOfDay,
  statusBg,
  taskSpan,
  tasksWord,
  type TimelinePayload,
  type TimelineScale
} from '~/utils/timeline'

useHead({ title: 'Таймлайн' })

const state = useTimelineState()
const {
  view, projectId, assigneeId, from, to, lateOnly, statuses, group, scaleChoice, hasFilters
} = state

// Lookups start alongside the timeline itself rather than before it.
const { data: projectData } = useFetch<{ data: Array<{ id: string, code: string, name: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const { data: staffData } = useFetch<{
  data: Array<{ userId: string, user: { firstName: string, lastName: string } }>
}>('/api/employees', { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) })

const { data, pending, error, refresh } = await useFetch<{ data: TimelinePayload }>(
  '/api/dashboard/timeline',
  { query: state.apiQuery, credentials: 'include' }
)

/*
 * Edits made in the task drawer opened from the chart — status, dates,
 * assignee — show up behind it as soon as they are saved, and once more when
 * the drawer closes to catch anything saved without announcing itself.
 */
const { stack: panelStack, changes: panelChanges } = useTaskPanels()
watch(panelChanges, () => refresh())
watch(() => panelStack.value.length, (next, previous) => {
  if (next < previous) refresh()
})

const projects = computed(() => projectData.value?.data ?? [])
const payload = computed(() => data.value?.data)
const today = startOfDay(Date.now())

/** "Only overdue" is a view on what was loaded, not a server filter. */
const tasks = computed(() => {
  const all = payload.value?.tasks ?? []
  return lateOnly.value ? all.filter(task => isLate(task, today)) : all
})
const timelineProjects = computed(() => payload.value?.projects ?? [])

/**
 * People to filter by: staff from the directory, plus anyone already assigned
 * in the loaded tasks — the directory is closed to some roles, and the filter
 * should still offer the names visible on the chart.
 */
const people = computed(() => {
  const map = new Map<string, string>()
  for (const row of staffData.value?.data ?? []) map.set(row.userId, personName(row.user))
  for (const task of payload.value?.tasks ?? []) {
    if (task.assignee) map.set(task.assignee.id, personName(task.assignee))
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
})

/** Scale fitted to the span on screen unless the user picked one. */
const scale = computed<TimelineScale>(() => {
  if (scaleChoice.value) return scaleChoice.value
  let days = 0
  if (from.value && to.value) {
    days = daysBetween(new Date(from.value + 'T00:00:00'), new Date(to.value + 'T00:00:00'))
  } else if (tasks.value.length > 0) {
    const spans = tasks.value.map(taskSpan)
    days = daysBetween(
      new Date(Math.min(...spans.map(span => span.start.getTime()))),
      new Date(Math.max(...spans.map(span => span.end.getTime())))
    )
  }
  if (days <= 45) return 'day'
  if (days <= 240) return 'week'
  return 'month'
})

const lateCount = computed(() => (payload.value?.tasks ?? []).filter(task => isLate(task, today)).length)

const subtitle = computed(() => {
  if (!payload.value) return 'Задачи, этапы, зависимости и вехи на одной шкале'
  const picked = projects.value.find(item => item.id === projectId.value)
  const scope = picked ? picked.code + ' · ' + picked.name : 'Все проекты'
  return scope + ' · ' + tasksWord(tasks.value.length) + ' на шкале'
})

function onlyStatus(status: string) {
  statuses.value = [status]
}

const selectClass = 'h-9 min-w-0 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring'
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
    <header class="mb-5">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Планирование
      </p>
      <div class="mt-1.5 flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold tracking-tight">Таймлайн</h1>
          <p class="mt-1 truncate text-sm text-muted-foreground">{{ subtitle }}</p>
        </div>

        <div class="inline-flex rounded-lg border bg-muted/40 p-0.5" role="tablist" aria-label="Вид">
          <button
            v-for="item in TIMELINE_VIEWS"
            :key="item.key"
            type="button"
            role="tab"
            :aria-selected="view === item.key"
            class="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition"
            :class="view === item.key
              ? 'bg-card font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'"
            @click="view = item.key"
          >
            <Icon :name="item.icon" class="size-4" />
            {{ item.label }}
          </button>
        </div>
      </div>
    </header>

    <section class="mb-4 space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-label="Настройка таймлайна">
      <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select v-model="projectId" :class="selectClass" aria-label="Проект">
          <option value="">Все проекты</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.code }} · {{ p.name }}</option>
        </select>

        <select v-model="assigneeId" :class="selectClass" aria-label="Исполнитель">
          <option value="">Все исполнители</option>
          <option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }}</option>
        </select>

        <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
          с
          <input v-model="from" type="date" :max="to || undefined" :class="selectClass" class="flex-1" aria-label="Начало периода">
        </label>
        <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
          по
          <input v-model="to" type="date" :min="from || undefined" :class="selectClass" class="flex-1" aria-label="Конец периода">
        </label>

        <label class="col-span-2 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm hover:bg-secondary sm:col-span-1">
          <input v-model="lateOnly" type="checkbox" class="accent-destructive">
          Только просроченные
          <span v-if="lateCount > 0" class="tabular-nums text-destructive">{{ lateCount }}</span>
        </label>

        <button
          v-if="hasFilters"
          type="button"
          class="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground sm:col-span-1"
          @click="state.resetFilters()"
        >
          <Icon name="lucide:x" class="size-4" />
          Сбросить
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Статусы">
          <button
            v-for="status in TIMELINE_STATUS_ORDER"
            :key="status"
            type="button"
            class="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition"
            :class="statuses.includes(status)
              ? 'border-foreground/40 bg-secondary font-medium text-foreground'
              : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'"
            :aria-pressed="statuses.includes(status)"
            @click="state.toggleStatus(status)"
          >
            <span class="size-2 rounded-full" :class="statusBg(status)" aria-hidden="true" />
            {{ enumLabel(TASK_STATUS_LABEL, status) }}
          </button>
        </div>

        <div v-if="view !== 'line'" class="flex flex-wrap items-center gap-2 sm:ml-auto">
          <select v-model="group" :class="selectClass" aria-label="Группировка">
            <option v-for="item in TIMELINE_GROUPS" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>

          <div v-if="view === 'gantt'" class="inline-flex rounded-md border p-0.5" role="group" aria-label="Масштаб">
            <button
              v-for="item in TIMELINE_SCALES"
              :key="item.key"
              type="button"
              class="h-7 rounded px-2.5 text-xs"
              :class="scale === item.key
                ? 'bg-secondary font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground'"
              :aria-pressed="scale === item.key"
              @click="scaleChoice = item.key"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <p
      v-if="projects.length === 0 && !payload?.tasks.length"
      class="rounded-xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground"
    >
      Ни одного проекта ещё нет — размещать на шкале нечего.
      <NuxtLink to="/projects/create" class="text-foreground underline underline-offset-4">
        Создать проект
      </NuxtLink>
    </p>

    <div
      v-else-if="error"
      class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center"
    >
      <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
      <p class="mt-3 text-sm">Не удалось загрузить таймлайн</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <div v-else-if="pending && !payload" class="space-y-3">
      <div v-for="n in 6" :key="n" class="h-10 rounded-lg bg-muted" />
    </div>

    <div
      v-else-if="tasks.length === 0 && (view !== 'gantt' || timelineProjects.every(p => p.milestones.length === 0))"
      class="rounded-xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground"
    >
      <template v-if="hasFilters">
        Под эти фильтры не попала ни одна задача с датами.
        <button type="button" class="text-foreground underline underline-offset-4" @click="state.resetFilters()">
          Сбросить фильтры
        </button>
      </template>
      <template v-else>
        У задач пока нет ни дат начала, ни сроков — разместить их на шкале не на чем.
      </template>
    </div>

    <template v-else>
      <div :class="pending ? 'opacity-60 transition-opacity' : ''">
        <TimelineGantt
          v-if="view === 'gantt'"
          :tasks="tasks"
          :projects="timelineProjects"
          :group="group"
          :scale="scale"
          :from="from"
          :to="to"
        />
        <TimelineLine v-else-if="view === 'line'" :tasks="tasks" :projects="timelineProjects" />
        <TimelineCharts
          v-else
          :tasks="tasks"
          :projects="timelineProjects"
          :group="group"
          @status="onlyStatus"
        />
      </div>
    </template>

    <div class="mt-3 space-y-1 text-xs text-muted-foreground">
      <p v-if="view === 'gantt'">
        Красная вертикаль — сегодня. Красная обводка и пунктирный хвост — просроченная задача,
        стрелки — зависимости (красный пунктир — задача начинается раньше, чем закончится та, от которой она зависит).
        Ромбы — вехи. Клик по полосе открывает задачу.
      </p>
      <p v-if="payload && payload.undated > 0">
        Без дат и потому не на шкале: {{ tasksWord(payload.undated) }} — им не назначены ни начало, ни срок.
      </p>
      <p v-if="payload?.truncated" class="text-destructive">
        Показаны первые {{ countLabel(payload.limit, 'задача', 'задачи', 'задач') }} — сузьте период или выберите проект.
      </p>
    </div>
  </div>
</template>
