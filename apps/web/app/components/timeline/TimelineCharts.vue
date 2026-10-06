<script setup lang="ts">
import {
  TIMELINE_GROUPS,
  addDays,
  countByStatus,
  daysBetween,
  groupContext,
  groupTasks,
  isFinished,
  isLate,
  shortDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  statusBg,
  type StatusCount,
  type TimelineGroup,
  type TimelineProject,
  type TimelineTask
} from '~/utils/timeline'

/**
 * Chart view: where the work stands (status mix per group) and when it lands
 * (deadlines per week or month, stacked by status). Plain CSS bars in the
 * same status colours as the Gantt, so a colour means one thing on the page.
 */
const props = defineProps<{
  tasks: TimelineTask[]
  projects: TimelineProject[]
  group: TimelineGroup
}>()

const emit = defineEmits<{ status: [status: string] }>()

const today = startOfDay(Date.now())
const ACTIVE = new Set(['IN_PROGRESS', 'REVIEW', 'REVISION'])

const kpi = computed(() => {
  const total = props.tasks.length
  const done = props.tasks.filter(task => isFinished(task.status)).length
  return {
    total,
    active: props.tasks.filter(task => ACTIVE.has(task.status)).length,
    late: props.tasks.filter(task => isLate(task, today)).length,
    blocked: props.tasks.filter(task => task.status === 'BLOCKED').length,
    donePct: total > 0 ? Math.round((done / total) * 100) : 0
  }
})

const legend = computed(() => countByStatus(props.tasks))

const groupLabel = computed(() =>
  (TIMELINE_GROUPS.find(item => item.key === props.group)?.label ?? '').toLowerCase()
)

/** One bar per group; its length is the group's volume, its segments the mix. */
const breakdown = computed(() => {
  const rows = groupTasks(props.tasks, props.group, groupContext(props.projects), props.projects.length > 1)
    .map(row => ({
      key: row.key,
      label: row.label,
      total: row.tasks.length,
      late: row.tasks.filter(task => isLate(task, today)).length,
      segments: countByStatus(row.tasks)
    }))
  const max = Math.max(1, ...rows.map(row => row.total))
  return rows.map(row => ({ ...row, width: (row.total / max) * 100 }))
})

/** Weekly buckets up to about half a year of deadlines, monthly beyond. */
const deadlineBuckets = computed(() => {
  const dated = props.tasks.filter(task => task.deadline)
  if (dated.length === 0) return { unit: 'week' as const, columns: [] }

  const stamps = dated.map(task => startOfDay(task.deadline as string).getTime())
  const first = new Date(Math.min(...stamps))
  const last = new Date(Math.max(...stamps))
  const unit = daysBetween(first, last) > 190 ? 'month' as const : 'week' as const
  const bucketOf = (date: Date) => (unit === 'week' ? startOfWeek(date) : startOfMonth(date))
  const step = (date: Date) =>
    unit === 'week' ? addDays(date, 7) : new Date(date.getFullYear(), date.getMonth() + 1, 1)

  const columns: Array<{
    key: number, label: string, current: boolean, total: number, late: number, segments: StatusCount[]
  }> = []
  for (let cursor = bucketOf(first); cursor <= last; cursor = step(cursor)) {
    const next = step(cursor)
    const inside = dated.filter(task => {
      const due = startOfDay(task.deadline as string)
      return due >= cursor && due < next
    })
    columns.push({
      key: cursor.getTime(),
      label: unit === 'week'
        ? shortDay(cursor)
        : cursor.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
      current: cursor <= today && today < next,
      total: inside.length,
      late: inside.filter(task => isLate(task, today)).length,
      segments: countByStatus(inside)
    })
  }
  return { unit, columns }
})

const columnMax = computed(() => Math.max(1, ...deadlineBuckets.value.columns.map(column => column.total)))

function segmentTitle(label: string, segment: StatusCount) {
  return label + ' · ' + enumLabel(TASK_STATUS_LABEL, segment.status) + ': ' + segment.count
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-xl border bg-card px-4 py-3">
        <p class="text-xs text-muted-foreground">Задач на шкале</p>
        <p class="mt-1 text-xl font-semibold tabular-nums">{{ kpi.total }}</p>
      </div>
      <div class="rounded-xl border bg-card px-4 py-3">
        <p class="text-xs text-muted-foreground">В работе</p>
        <p class="mt-1 text-xl font-semibold tabular-nums">{{ kpi.active }}</p>
      </div>
      <div class="rounded-xl border bg-card px-4 py-3">
        <p class="text-xs text-muted-foreground">Просрочено</p>
        <p class="mt-1 text-xl font-semibold tabular-nums" :class="kpi.late > 0 ? 'text-destructive' : ''">
          {{ kpi.late }}
          <span v-if="kpi.blocked > 0" class="text-sm font-normal text-muted-foreground">
            · {{ kpi.blocked }} заблок.
          </span>
        </p>
      </div>
      <div class="rounded-xl border bg-card px-4 py-3">
        <p class="text-xs text-muted-foreground">Готово</p>
        <p class="mt-1 text-xl font-semibold tabular-nums">{{ kpi.donePct }}%</p>
      </div>
    </div>

    <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Легенда">
      <button
        v-for="item in legend"
        :key="item.status"
        type="button"
        class="inline-flex items-center gap-1.5 rounded hover:text-foreground"
        :title="'Показать только: ' + enumLabel(TASK_STATUS_LABEL, item.status)"
        @click="emit('status', item.status)"
      >
        <span class="size-2.5 rounded-sm" :class="statusBg(item.status)" />
        {{ enumLabel(TASK_STATUS_LABEL, item.status) }}
        <span class="tabular-nums">{{ item.count }}</span>
      </button>
    </div>

    <section class="rounded-xl border bg-card p-4 sm:p-5">
      <h2 class="text-sm font-semibold">Статусы {{ groupLabel }}</h2>
      <p class="mt-0.5 text-xs text-muted-foreground">
        Длина полосы — объём задач, сегменты — в каком они состоянии.
      </p>
      <ul class="mt-4 space-y-2.5">
        <li
          v-for="row in breakdown"
          :key="row.key"
          class="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]"
        >
          <span class="truncate text-sm" :title="row.label">{{ row.label }}</span>
          <div class="flex min-w-0 items-center gap-2">
            <div class="flex h-5 min-w-1 overflow-hidden rounded" :style="{ width: row.width + '%' }">
              <span
                v-for="segment in row.segments"
                :key="segment.status"
                class="h-full"
                :class="statusBg(segment.status)"
                :style="{ flexGrow: segment.count, flexBasis: 0 }"
                :title="segmentTitle(row.label, segment)"
              />
            </div>
            <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
              {{ row.total }}
              <span v-if="row.late > 0" class="text-destructive">· {{ row.late }} просроч.</span>
            </span>
          </div>
        </li>
      </ul>
    </section>

    <section class="rounded-xl border bg-card p-4 sm:p-5">
      <h2 class="text-sm font-semibold">
        Сроки по {{ deadlineBuckets.unit === 'week' ? 'неделям' : 'месяцам' }}
      </h2>
      <p class="mt-0.5 text-xs text-muted-foreground">
        Сколько задач должно закрыться в каждый период и в каком они статусе сейчас.
        Красное число — уже просрочено.
      </p>

      <p v-if="deadlineBuckets.columns.length === 0" class="mt-4 text-sm text-muted-foreground">
        Ни у одной задачи нет срока.
      </p>
      <div v-else class="mt-4 overflow-x-auto pb-1">
        <div class="flex h-56 min-w-full items-end gap-1.5" :style="{ width: deadlineBuckets.columns.length * 2.75 + 'rem' }">
          <div
            v-for="column in deadlineBuckets.columns"
            :key="column.key"
            class="flex h-full min-w-9 flex-1 flex-col items-center justify-end gap-1"
          >
            <span class="text-[11px] tabular-nums" :class="column.late > 0 ? 'font-medium text-destructive' : 'text-muted-foreground'">
              {{ column.late > 0 ? column.late : column.total || '' }}
            </span>
            <div
              class="flex w-full flex-col-reverse overflow-hidden rounded-t"
              :class="column.current ? 'outline-2 outline-offset-2 outline-destructive/60' : ''"
              :style="{ height: (column.total / columnMax) * 85 + '%' }"
            >
              <span
                v-for="segment in column.segments"
                :key="segment.status"
                class="w-full"
                :class="statusBg(segment.status)"
                :style="{ flexGrow: segment.count, flexBasis: 0 }"
                :title="segmentTitle(column.label, segment)"
              />
            </div>
            <span
              class="w-full truncate border-t pt-1 text-center text-[10px] tabular-nums"
              :class="column.current ? 'font-semibold text-destructive' : 'text-muted-foreground'"
            >
              {{ column.label }}
            </span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
