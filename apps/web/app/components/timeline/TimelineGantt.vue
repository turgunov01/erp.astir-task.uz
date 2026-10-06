<script setup lang="ts">
import {
  addDays,
  daysBetween,
  groupContext,
  groupTasks,
  isFinished,
  isLate,
  personName,
  shortDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  statusBg,
  taskSpan,
  type TimelineGroup,
  type TimelineProject,
  type TimelineScale,
  type TimelineTask
} from '~/utils/timeline'
import { useTaskPanels } from '~/composables/useTaskPanels'

/**
 * Gantt chart drawn with plain positioned elements and one SVG layer for the
 * dependency arrows. Rows have fixed heights, so every bar's position is pure
 * arithmetic — no measuring, no layout library, and the server renders the
 * same chart the browser shows.
 */
const props = defineProps<{
  tasks: TimelineTask[]
  projects: TimelineProject[]
  group: TimelineGroup
  scale: TimelineScale
  /** Filter period (yyyy-mm-dd), which pins the axis when set. */
  from: string
  to: string
}>()

const { openTask } = useTaskPanels()

const PX_PER_DAY: Record<TimelineScale, number> = { day: 32, week: 12, month: 4 }
const PADDING_DAYS: Record<TimelineScale, number> = { day: 2, week: 7, month: 14 }
const MIN_DAYS: Record<TimelineScale, number> = { day: 21, week: 84, month: 270 }
const ROW_H = 32
const GROUP_H = 30
const BAR_H = 18
/** Below this a bar is too short to hold its own title. */
const INLINE_LABEL_MIN = 72

const today = startOfDay(Date.now())
const px = computed(() => PX_PER_DAY[props.scale])

function align(date: Date) {
  if (props.scale === 'week') return startOfWeek(date)
  if (props.scale === 'month') return startOfMonth(date)
  return startOfDay(date)
}

const milestones = computed(() =>
  props.projects
    .flatMap(project =>
      project.milestones
        .filter(item => item.dueDate)
        .map(item => ({ ...item, due: startOfDay(item.dueDate as string), code: project.code }))
    )
    .sort((a, b) => a.due.getTime() - b.due.getTime())
)

/** Below this a milestone keeps only its diamond; the name stays in the tooltip. */
const MIN_MILESTONE_LABEL = 28
const MILESTONE_LABEL_MAX = 160
const MILESTONE_GAP = 22

/*
 * Each name may run only up to the next diamond, so neighbouring milestones
 * a few days apart never print over each other.
 */
const milestoneLabelWidth = computed(() => {
  const widths = new Map<string, number>()
  const list = milestones.value
  list.forEach((item, index) => {
    const next = list[index + 1]
    const room = next ? x(next.due) - x(item.due) - MILESTONE_GAP : MILESTONE_LABEL_MAX
    widths.set(item.id, Math.min(MILESTONE_LABEL_MAX, room))
  })
  return widths
})

/** Axis: the filter period when given, otherwise everything dated plus padding. */
const axis = computed(() => {
  const stamps: number[] = []
  for (const task of props.tasks) {
    const span = taskSpan(task)
    stamps.push(span.start.getTime(), span.end.getTime())
  }
  for (const item of milestones.value) stamps.push(item.due.getTime())
  if (stamps.length === 0) stamps.push(today.getTime())

  const pad = PADDING_DAYS[props.scale]
  let start = props.from ? startOfDay(props.from + 'T00:00:00') : addDays(new Date(Math.min(...stamps)), -pad)
  let end = props.to ? addDays(startOfDay(props.to + 'T00:00:00'), 1) : addDays(new Date(Math.max(...stamps)), pad)

  start = align(start)
  if (daysBetween(start, end) < MIN_DAYS[props.scale]) end = addDays(start, MIN_DAYS[props.scale])
  const days = daysBetween(start, end)
  return { start, end, days, width: days * px.value }
})

function x(date: Date) {
  return daysBetween(axis.value.start, date) * px.value
}

interface Tick { key: string, label: string, left: number, width: number, weekend?: boolean }

function segments(step: (d: Date) => Date, first: (d: Date) => Date, label: (d: Date) => string) {
  const result: Tick[] = []
  let cursor = first(axis.value.start)
  while (cursor < axis.value.end) {
    const next = step(cursor)
    const left = Math.max(0, x(cursor))
    const right = Math.min(axis.value.width, x(next))
    if (right > left) result.push({ key: cursor.toISOString(), label: label(cursor), left, width: right - left })
    cursor = next
  }
  return result
}

const nextMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
const nextYear = (d: Date) => new Date(d.getFullYear() + 1, 0, 1)

/** Upper header tier: months, or years on the month scale. */
const topTicks = computed(() =>
  props.scale === 'month'
    ? segments(nextYear, d => new Date(d.getFullYear(), 0, 1), d => String(d.getFullYear()))
    : segments(nextMonth, startOfMonth, d => d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }))
)

/** Lower header tier: days, weeks or months — also the grid lines. */
const bottomTicks = computed<Tick[]>(() => {
  if (props.scale === 'day') {
    return segments(d => addDays(d, 1), startOfDay, d => String(d.getDate()))
      .map(tick => ({ ...tick, weekend: [0, 6].includes(new Date(tick.key).getDay()) }))
  }
  if (props.scale === 'week') return segments(d => addDays(d, 7), startOfWeek, d => shortDay(d))
  return segments(nextMonth, startOfMonth, d => d.toLocaleDateString('ru-RU', { month: 'short' }))
})

/** Weekend columns, shaded on the day and week scales. */
const weekends = computed(() => {
  if (props.scale === 'month') return []
  const result: number[] = []
  for (let i = 0; i < axis.value.days; i++) {
    const day = addDays(axis.value.start, i).getDay()
    if (day === 6) result.push(i * px.value)
  }
  return result
})

const todayX = computed(() => {
  if (today < axis.value.start || today >= axis.value.end) return null
  return x(today) + px.value / 2
})

const collapsed = ref<string[]>([])

function toggle(key: string) {
  collapsed.value = collapsed.value.includes(key)
    ? collapsed.value.filter(item => item !== key)
    : [...collapsed.value, key]
}

const groups = computed(() =>
  groupTasks(props.tasks, props.group, groupContext(props.projects), props.projects.length > 1)
)

type Row =
  | { kind: 'milestones', key: string, top: number, height: number }
  | { kind: 'group', key: string, top: number, height: number, label: string, to?: string,
      count: number, late: number, span: { left: number, width: number } }
  | { kind: 'task', key: string, top: number, height: number, task: TimelineTask }

const rows = computed<Row[]>(() => {
  const result: Row[] = []
  let top = 0
  if (milestones.value.length > 0) {
    result.push({ kind: 'milestones', key: 'milestones', top, height: ROW_H })
    top += ROW_H
  }
  for (const group of groups.value) {
    const spans = group.tasks.map(taskSpan)
    const left = x(new Date(Math.min(...spans.map(span => span.start.getTime()))))
    const right = x(new Date(Math.max(...spans.map(span => span.end.getTime()))))
    result.push({
      kind: 'group',
      key: 'g:' + group.key,
      top,
      height: GROUP_H,
      label: group.label,
      to: group.to,
      count: group.tasks.length,
      late: group.tasks.filter(task => isLate(task, today)).length,
      span: { left, width: Math.max(2, right - left) }
    })
    top += GROUP_H
    if (collapsed.value.includes('g:' + group.key)) continue
    for (const task of group.tasks) {
      result.push({ kind: 'task', key: task.id, top, height: ROW_H, task })
      top += ROW_H
    }
  }
  return result
})

const bodyHeight = computed(() => {
  const last = rows.value[rows.value.length - 1]
  return last ? last.top + last.height : 0
})

function bar(task: TimelineTask) {
  const span = taskSpan(task)
  const left = x(span.start)
  const width = Math.max(6, x(span.end) - left)
  const late = isLate(task, today)
  // Late work keeps running to today: draw how far past the deadline it is.
  const overrun = late ? Math.max(0, x(addDays(today, 1)) - (left + width)) : 0
  return { left, width, late, overrun, inline: width >= INLINE_LABEL_MIN }
}

function barTitle(task: TimelineTask) {
  const parts = [task.title, enumLabel(TASK_STATUS_LABEL, task.status)]
  if (task.startDate) parts.push('с ' + formatDay(task.startDate))
  if (task.deadline) parts.push('до ' + formatDay(task.deadline))
  parts.push(personName(task.assignee))
  if (isLate(task, today)) parts.push('просрочена')
  return parts.join(' · ')
}

/**
 * Finish-to-start arrows. A dependency whose successor starts before the
 * predecessor ends is a scheduling conflict and is drawn in red.
 */
const arrows = computed(() => {
  const rowOf = new Map<string, number>()
  for (const row of rows.value) {
    if (row.kind === 'task') rowOf.set(row.task.id, row.top + row.height / 2)
  }
  const byId = new Map(props.tasks.map(task => [task.id, task]))
  const result: Array<{ key: string, d: string, conflict: boolean }> = []

  for (const task of props.tasks) {
    const y2 = rowOf.get(task.id)
    if (y2 === undefined) continue
    for (const dep of task.dependencies) {
      const before = byId.get(dep.dependsOnTaskId)
      const y1 = rowOf.get(dep.dependsOnTaskId)
      if (!before || y1 === undefined) continue

      const x1 = x(taskSpan(before).end)
      const x2 = x(taskSpan(task).start)
      const conflict = x2 < x1 && !isFinished(before.status)
      const bend = y2 > y1 ? 1 : -1
      const d = x2 - x1 >= 16
        ? `M${x1},${y1} H${x1 + 8} V${y2} H${x2 - 2}`
        : `M${x1},${y1} H${x1 + 8} V${y2 - bend * (ROW_H / 2)} H${x2 - 10} V${y2} H${x2 - 2}`
      result.push({ key: task.id + dep.dependsOnTaskId, d, conflict })
    }
  }
  return result
})

const scroller = ref<HTMLElement | null>(null)

/** Open on today rather than on the far left of a long project. */
function scrollToToday() {
  const el = scroller.value
  if (!el || todayX.value === null) return
  el.scrollLeft = Math.max(0, todayX.value - el.clientWidth / 3)
}

onMounted(scrollToToday)
watch(() => [props.scale, axis.value.start.getTime()], () => nextTick(scrollToToday))
</script>

<template>
  <div
    ref="scroller"
    class="relative max-h-[calc(100dvh-15rem)] min-h-72 overflow-auto rounded-xl border bg-card [--label-w:9.5rem] sm:[--label-w:16rem]"
  >
    <div class="relative" :style="{ width: `calc(var(--label-w) + ${axis.width}px)` }">
      <!-- Header: sticky to the top while the rows scroll under it. -->
      <div class="sticky top-0 z-40 flex border-b bg-card">
        <div
          class="sticky left-0 z-10 flex w-(--label-w) shrink-0 items-end border-r bg-card px-3 pb-1.5 text-xs font-medium text-muted-foreground"
        >
          Задача
        </div>
        <div class="relative h-12 shrink-0" :style="{ width: axis.width + 'px' }">
          <span
            v-for="tick in topTicks"
            :key="'t' + tick.key"
            class="absolute top-0 h-6 truncate border-l px-1.5 pt-1 text-xs font-medium capitalize"
            :style="{ left: tick.left + 'px', width: tick.width + 'px' }"
          >
            {{ tick.label }}
          </span>
          <span
            v-for="tick in bottomTicks"
            :key="'b' + tick.key"
            class="absolute top-6 h-6 truncate border-l border-t pt-1 text-center text-[11px] tabular-nums text-muted-foreground"
            :class="tick.weekend ? 'bg-muted/50' : ''"
            :style="{ left: tick.left + 'px', width: tick.width + 'px' }"
          >
            {{ tick.label }}
          </span>
        </div>
      </div>

      <div class="relative" :style="{ height: bodyHeight + 'px' }">
        <!-- Grid, weekends and today, behind every row. -->
        <div
          class="pointer-events-none absolute inset-y-0 left-(--label-w)"
          :style="{ width: axis.width + 'px' }"
          aria-hidden="true"
        >
          <div
            v-for="left in weekends"
            :key="'w' + left"
            class="absolute inset-y-0 bg-muted/40"
            :style="{ left: left + 'px', width: px * 2 + 'px' }"
          />
          <div
            v-for="tick in bottomTicks"
            :key="'g' + tick.key"
            class="absolute inset-y-0 border-l border-border/60"
            :style="{ left: tick.left + 'px' }"
          />
          <div
            v-if="todayX !== null"
            class="absolute inset-y-0 z-30 w-0.5 bg-destructive/70"
            :style="{ left: todayX + 'px' }"
          />
        </div>

        <!-- Dependency arrows, above the bars and below the sticky labels. -->
        <svg
          v-if="arrows.length > 0"
          class="pointer-events-none absolute top-0 left-(--label-w) z-20 overflow-visible"
          :width="axis.width"
          :height="bodyHeight"
          aria-hidden="true"
        >
          <defs>
            <marker id="tl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" class="fill-muted-foreground" />
            </marker>
            <marker id="tl-arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" class="fill-destructive" />
            </marker>
          </defs>
          <path
            v-for="arrow in arrows"
            :key="arrow.key"
            :d="arrow.d"
            fill="none"
            stroke-width="1.25"
            :class="arrow.conflict ? 'stroke-destructive' : 'stroke-muted-foreground/70'"
            :stroke-dasharray="arrow.conflict ? '4 3' : undefined"
            :marker-end="arrow.conflict ? 'url(#tl-arrow-bad)' : 'url(#tl-arrow)'"
          />
        </svg>

        <template v-for="row in rows" :key="row.key">
          <div
            v-if="row.kind === 'milestones'"
            class="absolute inset-x-0 flex border-b border-border/60"
            :style="{ top: row.top + 'px', height: row.height + 'px' }"
          >
            <div class="sticky left-0 z-30 flex w-(--label-w) shrink-0 items-center gap-2 border-r bg-card px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Icon name="lucide:flag" class="size-3.5" />
              Вехи
            </div>
            <div class="relative shrink-0" :style="{ width: axis.width + 'px' }">
              <div
                v-for="item in milestones"
                :key="item.id"
                class="absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5"
                :style="{ left: x(item.due) + px / 2 - 6 + 'px' }"
                :title="item.code + ' · ' + item.name + ' · ' + formatDay(item.dueDate)"
              >
                <span
                  class="size-3 shrink-0 rotate-45 rounded-[2px] ring-2 ring-card"
                  :class="item.completedAt
                    ? 'bg-emerald-600'
                    : item.due < today ? 'bg-destructive' : 'bg-violet-500'"
                />
                <span
                  v-if="scale !== 'month' && (milestoneLabelWidth.get(item.id) ?? 0) >= MIN_MILESTONE_LABEL"
                  class="truncate text-xs text-muted-foreground"
                  :style="{ maxWidth: milestoneLabelWidth.get(item.id) + 'px' }"
                >
                  {{ item.name }}
                </span>
              </div>
            </div>
          </div>

          <div
            v-else-if="row.kind === 'group'"
            class="absolute inset-x-0 flex border-b bg-muted/30"
            :style="{ top: row.top + 'px', height: row.height + 'px' }"
          >
            <div class="sticky left-0 z-30 flex w-(--label-w) shrink-0 items-center gap-1 border-r bg-muted px-1.5">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-medium hover:bg-secondary"
                :aria-expanded="!collapsed.includes(row.key)"
                @click="toggle(row.key)"
              >
                <Icon
                  name="lucide:chevron-down"
                  class="size-3.5 shrink-0 transition-transform"
                  :class="collapsed.includes(row.key) ? '-rotate-90' : ''"
                />
                <span class="truncate" :title="row.label">{{ row.label }}</span>
                <span class="ml-auto shrink-0 tabular-nums text-muted-foreground">{{ row.count }}</span>
                <span v-if="row.late > 0" class="shrink-0 tabular-nums text-destructive" :title="'Просрочено: ' + row.late">
                  · {{ row.late }}
                </span>
              </button>
              <NuxtLink
                v-if="row.to"
                :to="row.to"
                class="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Открыть проект"
              >
                <Icon name="lucide:arrow-up-right" class="size-3.5" />
              </NuxtLink>
            </div>
            <div class="relative shrink-0" :style="{ width: axis.width + 'px' }">
              <div
                class="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/25"
                :style="{ left: row.span.left + 'px', width: row.span.width + 'px' }"
              />
            </div>
          </div>

          <div
            v-else
            class="group/row absolute inset-x-0 flex border-b border-border/40 hover:bg-secondary/30"
            :style="{ top: row.top + 'px', height: row.height + 'px' }"
          >
            <button
              type="button"
              class="sticky left-0 z-30 flex w-(--label-w) shrink-0 items-center gap-2 border-r bg-card px-3 text-left text-sm group-hover/row:bg-secondary"
              :title="row.task.title"
              @click="openTask(row.task.id)"
            >
              <span class="size-2 shrink-0 rounded-full" :class="statusBg(row.task.status)" aria-hidden="true" />
              <span class="truncate" :class="isLate(row.task, today) ? 'text-destructive' : ''">
                {{ row.task.title }}
              </span>
            </button>
            <div class="relative shrink-0" :style="{ width: axis.width + 'px' }">
              <template v-for="b in [bar(row.task)]" :key="'bar'">
                <div
                  v-if="b.overrun > 0"
                  class="absolute top-1/2 -translate-y-1/2 rounded-r border border-l-0 border-dashed border-destructive/60 bg-destructive/10"
                  :style="{ left: b.left + b.width + 'px', width: b.overrun + 'px', height: BAR_H + 'px' }"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  class="absolute top-1/2 z-10 flex -translate-y-1/2 items-center overflow-hidden rounded px-1.5 text-left text-[11px] font-medium text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  :class="[statusBg(row.task.status), b.late ? 'ring-2 ring-destructive ring-offset-1 ring-offset-card' : '']"
                  :style="{ left: b.left + 'px', width: b.width + 'px', height: BAR_H + 'px' }"
                  :title="barTitle(row.task)"
                  :aria-label="barTitle(row.task)"
                  @click="openTask(row.task.id)"
                >
                  <span v-if="b.inline" class="truncate">{{ row.task.title }}</span>
                </button>
                <span
                  v-if="!b.inline"
                  class="pointer-events-none absolute top-1/2 max-w-48 -translate-y-1/2 truncate text-[11px] text-muted-foreground"
                  :style="{ left: b.left + b.width + b.overrun + 6 + 'px' }"
                >
                  {{ row.task.title }}
                </span>
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
