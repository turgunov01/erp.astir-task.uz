<script setup lang="ts">
import { useTaskPanels } from '~/composables/useTaskPanels'

/**
 * One of the user's own tasks, as a line of the personal list.
 *
 * Built to answer "what is next and when is it due" at a glance: the deadline
 * is spelled out relative to today, and the project and shot it belongs to sit
 * under the title so nobody has to open the task to know what it is for.
 */
export interface PersonalTask {
  id: string
  title: string
  status: string
  priority: string
  deadline: string | null
  project: { id: string, code: string, name: string } | null
  shot: { id: string, code: string } | null
  stage: { id: string, name: string } | null
}

const props = defineProps<{
  task: PersonalTask
  /** Whether this session may move the task between statuses. */
  canUpdate: boolean
}>()

const emit = defineEmits<{ changed: [] }>()

const { openTask } = useTaskPanels()
const { t } = useI18n()

const DAY_MS = 86_400_000
const FINISHED = ['DONE', 'APPROVED']

const changing = ref(false)

const late = computed(() =>
  Boolean(props.task.deadline) &&
  new Date(props.task.deadline as string) < new Date() &&
  !FINISHED.includes(props.task.status)
)

/** Whole calendar days from today to the deadline; negative once it passed. */
const daysLeft = computed(() => {
  if (!props.task.deadline) return null
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  return Math.round((startOfDay(new Date(props.task.deadline)) - startOfDay(new Date())) / DAY_MS)
})

const dueLabel = computed(() => {
  const days = daysLeft.value
  if (days === null) return t('production.personal.due.none')
  if (FINISHED.includes(props.task.status)) return formatDate(props.task.deadline as string)
  if (late.value && days <= 0) {
    return days === 0 ? t('production.personal.due.todayPassed') : t('production.personal.due.overdueBy', -days)
  }
  if (days === 0) return t('production.personal.due.today')
  if (days === 1) return t('production.personal.due.tomorrow')
  return t('production.personal.due.inDays', days)
})

/** Due within three days is worth a glance even before it is late. */
const dueSoon = computed(() => !late.value && daysLeft.value !== null && daysLeft.value <= 2 &&
  !FINISHED.includes(props.task.status))

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(intlTag(), { day: '2-digit', month: 'short' })
}

function onChanged() {
  changing.value = false
  emit('changed')
}
</script>

<template>
  <li class="group px-4 py-3 sm:px-5" :class="late ? 'bg-destructive/[0.03]' : ''">
    <div class="flex flex-wrap items-start gap-x-4 gap-y-2">
      <span
        class="mt-1.5 size-2 shrink-0 rounded-full"
        :class="late ? 'bg-destructive' : dueSoon ? 'bg-signal' : 'bg-border'"
        aria-hidden="true"
      />

      <div class="min-w-0 flex-1">
        <button
          type="button"
          class="text-left text-sm font-medium hover:underline"
          :class="late ? 'text-destructive' : ''"
          @click="openTask(task.id)"
        >
          {{ task.title }}
        </button>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <NuxtLink v-if="task.project" :to="'/projects/' + task.project.id" class="hover:text-foreground hover:underline">
            {{ task.project.code }} · {{ task.project.name }}
          </NuxtLink>
          <NuxtLink v-if="task.shot" :to="'/shots/' + task.shot.id" class="font-mono hover:text-foreground hover:underline">
            {{ task.shot.code }}
          </NuxtLink>
          <span v-if="task.stage">{{ task.stage.name }}</span>
        </p>
      </div>

      <div class="flex w-full flex-wrap items-center gap-2 pl-6 sm:w-auto sm:shrink-0 sm:pl-0">
        <span
          class="inline-flex items-center gap-1 text-xs tabular-nums"
          :class="late ? 'font-medium text-destructive' : dueSoon ? 'text-foreground' : 'text-muted-foreground'"
          :title="task.deadline ? formatDate(task.deadline) : undefined"
        >
          <Icon name="lucide:calendar-clock" class="size-3.5" />
          {{ dueLabel }}
        </span>
        <!-- Only the priorities that should change what gets done first. -->
        <span
          v-if="task.priority === 'HIGH' || task.priority === 'URGENT'"
          class="inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium"
          :class="task.priority === 'URGENT' ? 'bg-destructive/12 text-destructive' : 'bg-signal/18 text-amber-800 dark:text-amber-200'"
        >
          {{ enumLabel(PRIORITY_LABEL, task.priority) }}
        </span>
        <StatusBadge :status="task.status" />
        <button
          v-if="canUpdate && !changing"
          type="button"
          class="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          @click="changing = true"
        >
          <Icon name="lucide:arrow-right-left" class="size-3.5" />
          {{ t('production.personal.changeStatus') }}
        </button>
      </div>
    </div>

    <TaskQuickStatus
      v-if="changing"
      class="mt-3"
      :task-id="task.id"
      :status="task.status"
      :late="late"
      @changed="onChanged"
      @cancel="changing = false"
    />
  </li>
</template>
