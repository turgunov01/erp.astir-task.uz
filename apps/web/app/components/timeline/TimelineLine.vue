<script setup lang="ts">
import {
  addDays,
  isLate,
  personName,
  shortDay,
  startOfDay,
  startOfWeek,
  statusBg,
  type TimelineProject,
  type TimelineTask
} from '~/utils/timeline'
import { useTaskPanels } from '~/composables/useTaskPanels'

/**
 * Line view: one chronological strip, week by week, keyed on each task's
 * deadline (or its start when it has none). The "now" divider splits what
 * should already be finished from what is still ahead.
 */
const props = defineProps<{
  tasks: TimelineTask[]
  projects: TimelineProject[]
}>()

const { openTask } = useTaskPanels()
const { t } = useI18n()
const today = startOfDay(Date.now())

const projectById = computed(() => new Map(props.projects.map(project => [project.id, project])))
const stageById = computed(() => {
  const map = new Map<string, string>()
  for (const project of props.projects) {
    for (const stage of project.stages) map.set(stage.id, stage.name)
  }
  return map
})

function keyDate(task: TimelineTask) {
  return startOfDay((task.deadline ?? task.startDate) as string)
}

interface Entry {
  kind: 'task' | 'milestone'
  id: string
  date: Date
  task?: TimelineTask
  name?: string
  code?: string
  done?: boolean
}

/** Tasks and milestones on one line, bucketed into weeks. */
const weeks = computed(() => {
  const entries: Entry[] = props.tasks.map(task => ({
    kind: 'task', id: task.id, date: keyDate(task), task
  }))
  for (const project of props.projects) {
    for (const item of project.milestones) {
      if (!item.dueDate) continue
      entries.push({
        kind: 'milestone',
        id: item.id,
        date: startOfDay(item.dueDate),
        name: item.name,
        code: project.code,
        done: Boolean(item.completedAt)
      })
    }
  }
  entries.sort((a, b) => a.date.getTime() - b.date.getTime() || a.kind.localeCompare(b.kind))

  const buckets = new Map<number, { start: Date, entries: Entry[] }>()
  for (const entry of entries) {
    const start = startOfWeek(entry.date)
    const bucket = buckets.get(start.getTime())
    if (bucket) bucket.entries.push(entry)
    else buckets.set(start.getTime(), { start, entries: [entry] })
  }
  return [...buckets.values()].map(bucket => ({
    ...bucket,
    end: addDays(bucket.start, 6),
    current: bucket.start <= today && today <= addDays(bucket.start, 6),
    past: addDays(bucket.start, 6) < today
  }))
})

function range(task: TimelineTask) {
  if (task.startDate && task.deadline) return shortDay(task.startDate) + ' — ' + shortDay(task.deadline)
  if (task.deadline) return t('projects.timeline.untilDate', { date: shortDay(task.deadline) })
  return t('projects.timeline.fromDate', { date: shortDay(task.startDate as string) })
}
</script>

<template>
  <ol class="relative space-y-6 border-l-2 border-border pl-5 sm:pl-7">
    <li v-for="week in weeks" :key="week.start.getTime()" class="relative">
      <span
        class="absolute top-1 -left-[1.6rem] size-3 rounded-full border-2 border-card sm:-left-[2.1rem]"
        :class="week.current ? 'bg-destructive' : week.past ? 'bg-muted-foreground/50' : 'bg-foreground'"
        aria-hidden="true"
      />
      <h3 class="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
        {{ shortDay(week.start) }} — {{ shortDay(week.end) }}
        <span v-if="week.current" class="text-xs font-medium text-destructive">{{ t('projects.timeline.thisWeek') }}</span>
        <span class="text-xs font-normal text-muted-foreground">{{ week.entries.length }}</span>
      </h3>

      <ul class="mt-2 divide-y overflow-hidden rounded-xl border bg-card">
        <li v-for="entry in week.entries" :key="entry.kind + entry.id">
          <div
            v-if="entry.kind === 'milestone'"
            class="flex items-center gap-3 bg-violet-500/5 px-3 py-2.5 sm:px-4"
          >
            <span
              class="size-2.5 shrink-0 rotate-45 rounded-[1px]"
              :class="entry.done ? 'bg-emerald-600' : entry.date < today ? 'bg-destructive' : 'bg-violet-500'"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ entry.name }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">
              {{ entry.code }} · {{ t('projects.timeline.milestone') }} · {{ shortDay(entry.date) }}
            </span>
          </div>

          <button
            v-else-if="entry.task"
            type="button"
            class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left hover:bg-secondary/50 sm:flex-nowrap sm:px-4"
            @click="openTask(entry.task.id)"
          >
            <span class="size-2 shrink-0 rounded-full" :class="statusBg(entry.task.status)" aria-hidden="true" />
            <span class="min-w-0 flex-1 basis-40">
              <span class="block truncate text-sm font-medium">{{ entry.task.title }}</span>
              <span class="block truncate text-xs text-muted-foreground">
                {{ projectById.get(entry.task.projectId)?.code }}
                <template v-if="entry.task.stageId && stageById.get(entry.task.stageId)">
                  · {{ stageById.get(entry.task.stageId) }}
                </template>
                · {{ personName(entry.task.assignee) }}
              </span>
            </span>
            <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ range(entry.task) }}</span>
            <span
              class="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium"
              :class="isLate(entry.task, today)
                ? 'bg-destructive/12 text-destructive'
                : 'bg-secondary text-secondary-foreground'"
            >
              {{ isLate(entry.task, today) ? t('projects.timeline.lateBadge') : enumLabel(TASK_STATUS_LABEL, entry.task.status) }}
            </span>
          </button>
        </li>
      </ul>
    </li>
  </ol>
</template>
