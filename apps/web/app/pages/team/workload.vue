<script setup lang="ts">
import { useTaskPanels } from '~/composables/useTaskPanels'

useHead({ title: 'Загрузка команды — Aster ERP' })

const { openTask } = useTaskPanels()

interface WorkloadTask {
  id: string
  title: string
  status: string
  deadline: string | null
  estimatedHours: number | null
  project: { id: string, code: string } | null
}

interface WorkloadRow {
  employee: {
    id: string
    position: string
    user: { id: string, firstName: string, lastName: string }
    department: { id: string, name: string } | null
  }
  capacityHours: number
  assignedHours: number
  loggedThisWeek: number
  utilisation: number
  band: 'AVAILABLE' | 'NORMAL' | 'HIGH' | 'OVERLOADED'
  currentTasks: WorkloadTask[]
  upcomingTasks: WorkloadTask[]
  currentCount: number
  upcomingCount: number
}

const { data, pending, error, refresh } = await useFetch<{ data: WorkloadRow[] }>(
  '/api/timesheets/workload',
  { credentials: 'include', default: () => ({ data: [] }) }
)

const rows = computed(() => data.value?.data ?? [])

const BAND_LABEL: Record<string, string> = {
  AVAILABLE: 'Свободен',
  NORMAL: 'Норма',
  HIGH: 'Высокая',
  OVERLOADED: 'Перегружен'
}

/** Colour follows the band, so a row reads before its number does. */
const BAND_CLASS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  NORMAL: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  HIGH: 'bg-signal/18 text-amber-800 dark:text-amber-200',
  OVERLOADED: 'bg-destructive/12 text-destructive'
}

const BAR_CLASS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500',
  NORMAL: 'bg-sky-500',
  HIGH: 'bg-amber-500',
  OVERLOADED: 'bg-destructive'
}

const department = ref('')
const band = ref('')

const departments = computed(() => {
  const names = new Set<string>()
  for (const row of rows.value) {
    if (row.employee.department) names.add(row.employee.department.name)
  }
  return [...names].sort()
})

const visible = computed(() =>
  rows.value.filter(row =>
    (!department.value || row.employee.department?.name === department.value) &&
    (!band.value || row.band === band.value)
  )
)

const totals = computed(() => {
  const list = visible.value
  const capacity = list.reduce((sum, row) => sum + row.capacityHours, 0)
  const assigned = list.reduce((sum, row) => sum + row.assignedHours, 0)
  return {
    people: list.length,
    capacity,
    assigned,
    overloaded: list.filter(row => row.band === 'OVERLOADED').length,
    average: capacity > 0 ? Math.round((assigned / capacity) * 100) : 0
  }
})
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Планирование
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Загрузка команды</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ totals.people }} чел. · {{ totals.assigned }}ч назначено из {{ totals.capacity }}ч
        · средняя загрузка {{ totals.average }}%
        <span v-if="totals.overloaded > 0" class="text-destructive">
          · перегружено {{ totals.overloaded }}
        </span>
      </p>
    </header>

    <div class="mb-5 flex flex-wrap items-center gap-2">
      <select
        v-model="department"
        class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
        aria-label="Фильтр по отделу"
      >
        <option value="">Все отделы</option>
        <option v-for="name in departments" :key="name" :value="name">{{ name }}</option>
      </select>
      <select
        v-model="band"
        class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
        aria-label="Фильтр по загрузке"
      >
        <option value="">Любая загрузка</option>
        <option v-for="(label, key) in BAND_LABEL" :key="key" :value="key">{{ label }}</option>
      </select>
    </div>

    <div v-if="pending && rows.length === 0" class="space-y-3">
      <div v-for="n in 4" :key="n" class="h-24 rounded-xl bg-muted" />
    </div>

    <div
      v-else-if="error"
      class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center"
    >
      <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
      <p class="mt-3 text-sm">Не удалось загрузить данные</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <p
      v-else-if="visible.length === 0"
      class="rounded-xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground"
    >
      Под выбранные условия никто не подходит.
    </p>

    <ul v-else class="space-y-3">
      <li
        v-for="row in visible"
        :key="row.employee.id"
        class="rounded-xl border bg-card p-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium">
              {{ row.employee.user.firstName }} {{ row.employee.user.lastName }}
            </p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ row.employee.position }}
              <span v-if="row.employee.department"> · {{ row.employee.department.name }}</span>
            </p>
          </div>

          <div class="flex items-center gap-3">
            <span class="text-right text-sm tabular-nums">
              <span class="font-medium">{{ row.assignedHours }}ч</span>
              <span class="text-muted-foreground"> из {{ row.capacityHours }}ч</span>
            </span>
            <span
              class="rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
              :class="BAND_CLASS[row.band]"
            >
              {{ row.utilisation }}% · {{ BAND_LABEL[row.band] }}
            </span>
          </div>
        </div>

        <div class="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            class="h-full rounded-full"
            :class="BAR_CLASS[row.band]"
            :style="{ width: Math.min(100, row.utilisation) + '%' }"
          />
        </div>

        <div class="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              В работе на неделе
              <span class="ml-1 tabular-nums">{{ row.currentCount }}</span>
            </h3>
            <p v-if="row.currentTasks.length === 0" class="mt-1.5 text-sm text-muted-foreground">
              Ничего не назначено
            </p>
            <ul v-else class="mt-1.5 space-y-1">
              <li v-for="task in row.currentTasks" :key="task.id">
                <button
                  type="button"
                  class="flex w-full items-baseline gap-2 text-left text-sm hover:underline"
                  @click="openTask(task.id)"
                >
                  <span class="min-w-0 flex-1 truncate">{{ task.title }}</span>
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {{ task.project?.code ?? '—' }}
                  </span>
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Дальше
              <span class="ml-1 tabular-nums">{{ row.upcomingCount }}</span>
            </h3>
            <p v-if="row.upcomingTasks.length === 0" class="mt-1.5 text-sm text-muted-foreground">
              Очередь пуста
            </p>
            <ul v-else class="mt-1.5 space-y-1">
              <li v-for="task in row.upcomingTasks" :key="task.id">
                <button
                  type="button"
                  class="flex w-full items-baseline gap-2 text-left text-sm hover:underline"
                  @click="openTask(task.id)"
                >
                  <span class="min-w-0 flex-1 truncate">{{ task.title }}</span>
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {{ task.deadline ? formatDay(task.deadline) : '—' }}
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        <p v-if="row.loggedThisWeek > 0" class="mt-3 text-xs text-muted-foreground">
          Списано за эту неделю: {{ row.loggedThisWeek }}ч
        </p>
      </li>
    </ul>
  </div>
</template>
