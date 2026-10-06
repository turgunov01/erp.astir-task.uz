<script setup lang="ts">
import { PERMISSION } from '@astir/types'
import { useListResource } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { useTaskPanels } from '~/composables/useTaskPanels'
import type { PersonalTask } from '~/components/task/TaskPersonalRow.vue'

const { t } = useI18n()

useHead({ title: computed(() => t('production.myTasks.title')) })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { stack, setStack } = useTaskPanels()

const canUpdate = computed(() => auth.can(PERMISSION.TASK_UPDATE))

/** The API caps a page at this; a list that hits it says so. */
const PAGE_LIMIT = 100

/*
 * Open and finished work are fetched apart. Finished tasks only grow, and in a
 * single list they would eventually push the open ones past the page limit.
 * The API scopes `mine` to the session, so neither list can show anyone else's.
 */
const activeFilters = computed(() => ({
  mine: 'true', state: 'active', sort: 'deadline', order: 'asc', limit: PAGE_LIMIT
}))
const completedFilters = computed(() => ({
  mine: 'true', state: 'completed', sort: 'deadline', order: 'desc', limit: 25
}))

const active = useListResource<PersonalTask>('/api/tasks', activeFilters as never)
const completed = useListResource<PersonalTask>('/api/tasks', completedFilters as never)

function refreshAll() {
  return Promise.all([active.refresh(), completed.refresh()])
}

/** A ?task= link opens that task over the list, as on the main task page. */
onMounted(() => {
  const deepLink = String(route.query.task ?? '')
  if (deepLink) setStack([{ kind: 'task', id: deepLink }])
})

// Anything changed in the drawer shows up here once it is closed.
watch(() => stack.value.length, (next, previous) => {
  if (next < previous) refreshAll()
})

function isLate(task: PersonalTask) {
  return Boolean(task.deadline) && new Date(task.deadline as string) < new Date()
}

/**
 * Open work in the order it should be picked up: what is already late, then
 * what came back with notes, then what is under way, then what is waiting.
 * A task lands in the first section that claims it.
 */
const SECTIONS = [
  { key: 'late', icon: 'lucide:alarm-clock', match: isLate },
  { key: 'revision', icon: 'lucide:rotate-ccw', match: (task: PersonalTask) => task.status === 'REVISION' },
  { key: 'progress', icon: 'lucide:play', match: (task: PersonalTask) => task.status === 'IN_PROGRESS' },
  { key: 'todo', icon: 'lucide:circle-dashed', match: (task: PersonalTask) => task.status === 'READY' || task.status === 'BACKLOG' },
  { key: 'blocked', icon: 'lucide:octagon-pause', match: (task: PersonalTask) => task.status === 'BLOCKED' },
  { key: 'review', icon: 'lucide:eye', match: (task: PersonalTask) => task.status === 'REVIEW' }
] as const

type SectionKey = typeof SECTIONS[number]['key']

const grouped = computed(() => {
  const buckets = new Map<SectionKey, PersonalTask[]>(SECTIONS.map(section => [section.key, []]))
  for (const task of active.items.value) {
    const section = SECTIONS.find(candidate => candidate.match(task))
    if (section) buckets.set(section.key, [...(buckets.get(section.key) ?? []), task])
  }
  return SECTIONS.map(section => ({ ...section, tasks: buckets.get(section.key) ?? [] }))
})

const countOf = (key: SectionKey) => grouped.value.find(section => section.key === key)?.tasks.length ?? 0

/** Views as one shareable query param, like the main task page. */
const VIEWS = [
  { key: 'active' },
  { key: 'late' },
  { key: 'review' },
  { key: 'completed' }
] as const

type ViewKey = typeof VIEWS[number]['key']

const view = computed<ViewKey>(() => {
  const requested = String(route.query.view ?? 'active')
  return VIEWS.find(item => item.key === requested)?.key ?? 'active'
})

function selectView(key: ViewKey) {
  router.replace({ query: key === 'active' ? {} : { view: key } })
}

function viewCount(key: ViewKey) {
  if (key === 'active') return active.meta.value.total
  if (key === 'completed') return completed.meta.value.total
  return countOf(key)
}

/** Sections to draw for the current view; the active view shows them all. */
const visibleSections = computed(() => {
  if (view.value === 'completed') {
    return [{ key: 'completed', icon: 'lucide:circle-check', tasks: completed.items.value }]
  }
  const sections = grouped.value.filter(section => section.tasks.length > 0)
  return view.value === 'active' ? sections : sections.filter(section => section.key === view.value)
})

const pending = computed(() => view.value === 'completed' ? completed.pending.value : active.pending.value)
const errorMessage = computed(() =>
  view.value === 'completed' ? completed.errorMessage.value : active.errorMessage.value
)

/** Deadlines within the next seven days, counted from the open list. */
const dueThisWeek = computed(() => {
  const horizon = Date.now() + 7 * 86_400_000
  return active.items.value.filter(task =>
    task.deadline && !isLate(task) && new Date(task.deadline).getTime() <= horizon
  ).length
})

const summary = computed(() => [
  { label: t('production.myTasks.tiles.late'), value: countOf('late'), icon: 'lucide:alarm-clock', view: 'late' as ViewKey, signal: true },
  { label: t('production.myTasks.tiles.inWork'), value: countOf('progress') + countOf('revision'), icon: 'lucide:play', view: 'active' as ViewKey, signal: false },
  { label: t('production.myTasks.tiles.dueThisWeek'), value: dueThisWeek.value, icon: 'lucide:calendar-clock', view: 'active' as ViewKey, signal: false },
  { label: t('production.myTasks.tiles.review'), value: countOf('review'), icon: 'lucide:eye', view: 'review' as ViewKey, signal: false }
])

const emptyText = computed(() => {
  if (view.value === 'completed') return t('production.myTasks.empty.completed')
  if (view.value === 'late') return t('production.myTasks.empty.late')
  if (view.value === 'review') return t('production.myTasks.empty.review')
  return t('production.myTasks.empty.active')
})
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('production.myTasks.eyebrow') }}
        </p>
        <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('production.myTasks.title') }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t('production.myTasks.intro', { name: auth.user?.firstName ?? '' }) }}
        </p>
      </div>
      <NuxtLink
        v-if="auth.can(PERMISSION.TIMESHEET_VIEW_OWN)"
        to="/timesheets"
        class="inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm hover:bg-secondary"
      >
        <Icon name="lucide:clock" class="size-4" />
        {{ t('shell.nav.timesheets') }}
      </NuxtLink>
    </header>

    <section
      :aria-label="t('production.myTasks.summaryAria')"
      class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4"
    >
      <button
        v-for="tile in summary"
        :key="tile.label"
        type="button"
        class="bg-card px-4 py-3 text-left hover:bg-secondary/40 sm:px-5 sm:py-4"
        @click="selectView(tile.view)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm leading-snug text-muted-foreground">{{ tile.label }}</p>
            <p
              class="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl"
              :class="tile.signal && tile.value > 0 ? 'text-destructive' : ''"
            >
              <span v-if="active.pending.value" class="inline-block h-8 w-10 rounded bg-muted" />
              <template v-else>{{ tile.value }}</template>
            </p>
          </div>
          <span
            class="grid size-8 shrink-0 place-items-center rounded-md"
            :class="tile.signal && tile.value > 0 ? 'bg-destructive/12 text-destructive' : 'bg-secondary text-muted-foreground'"
          >
            <Icon :name="tile.icon" class="size-4" />
          </span>
        </div>
      </button>
    </section>

    <nav class="mb-4 mt-6 flex flex-wrap gap-1.5" :aria-label="t('production.myTasks.viewsAria')">
      <button
        v-for="item in VIEWS"
        :key="item.key"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
        :class="view === item.key ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'"
        :aria-pressed="view === item.key"
        @click="selectView(item.key)"
      >
        {{ t('production.myTasks.views.' + item.key) }}
        <span class="text-xs tabular-nums text-muted-foreground">{{ viewCount(item.key) }}</span>
      </button>
    </nav>

    <div v-if="errorMessage" class="rounded-xl border bg-card px-6 py-16 text-center">
      <Icon name="lucide:triangle-alert" class="size-8 text-destructive" />
      <p class="mt-3 text-sm font-medium">{{ errorMessage }}</p>
      <button
        type="button"
        class="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refreshAll()"
      >
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <div v-else-if="pending" class="divide-y rounded-xl border bg-card">
      <div v-for="n in 4" :key="n" class="flex items-center gap-4 px-5 py-4">
        <div class="h-4 flex-1 rounded bg-muted" />
        <div class="h-4 w-24 rounded bg-muted" />
      </div>
    </div>

    <div
      v-else-if="visibleSections.length === 0"
      class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center"
    >
      <Icon name="lucide:list-todo" class="size-8 text-muted-foreground/50" />
      <p class="mt-3 text-sm font-medium">{{ emptyText }}</p>
    </div>

    <div v-else class="space-y-5">
      <section
        v-for="section in visibleSections"
        :key="section.key"
        class="overflow-hidden rounded-xl border bg-card"
        :aria-labelledby="'section-' + section.key"
      >
        <header
          class="flex items-center gap-2 border-b px-4 py-2.5 sm:px-5"
          :class="section.key === 'late' ? 'bg-destructive/[0.06] text-destructive' : ''"
        >
          <Icon :name="section.icon" class="size-4" />
          <h2 :id="'section-' + section.key" class="text-sm font-medium">{{ t('production.myTasks.sections.' + section.key) }}</h2>
          <span class="text-xs tabular-nums text-muted-foreground">{{ section.tasks.length }}</span>
        </header>
        <ul class="divide-y">
          <TaskPersonalRow
            v-for="task in section.tasks"
            :key="task.id"
            :task="task"
            :can-update="canUpdate"
            @changed="refreshAll"
          />
        </ul>
      </section>

      <p
        v-if="view !== 'completed' && active.meta.value.total > active.items.value.length"
        class="text-center text-xs text-muted-foreground"
      >
        {{ t('production.myTasks.shownOf', { shown: active.items.value.length, total: active.meta.value.total }) }}
        <NuxtLink to="/tasks?view=my" class="underline hover:text-foreground">{{ t('production.myTasks.fullList') }}</NuxtLink>
      </p>
    </div>
  </div>
</template>
