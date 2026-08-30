<script setup lang="ts">
import { useTaskPanels } from '~/composables/useTaskPanels'

const props = defineProps<{
  date: string
  projectId?: string
  assigneeId?: string
  priority?: string
  /** Depth in the stack; deeper panels sit slightly further left. */
  offset: number
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const { openTask } = useTaskPanels()

interface Task {
  id: string
  title: string
  status: string
  priority: string
  deadline: string | null
  project: { id: string, code: string } | null
  shot: { id: string, code: string } | null
  assignee: { id: string, firstName: string, lastName: string } | null
}

/**
 * The API has no per-day endpoint, so the day is filtered client-side from the
 * same window the calendar already loads. Keeps one source of truth for what
 * "tasks on this date" means.
 */
const { data, pending, error, refresh } = await useFetch<{ data: Task[] }>('/api/tasks', {
  query: computed(() => ({
    limit: 100,
    projectId: props.projectId || undefined,
    assigneeId: props.assigneeId || undefined,
    priority: props.priority || undefined
  })),
  credentials: 'include',
  default: () => ({ data: [] })
})

function dayKey(value: string) {
  const date = new Date(value)
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0')
}

const tasks = computed(() =>
  (data.value?.data ?? []).filter(task => task.deadline && dayKey(task.deadline) === props.date)
)

const heading = computed(() => {
  const [year, month, day] = props.date.split('-').map(Number)
  if (!year || !month || !day) return props.date
  return new Date(year, month - 1, day).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
})

const overdueCount = computed(() =>
  tasks.value.filter(task =>
    task.deadline &&
    new Date(task.deadline) < new Date() &&
    !['DONE', 'APPROVED'].includes(task.status)
  ).length
)
</script>

<template>
  <aside
    class="drawer-panel pointer-events-auto relative flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl"
    :style="{ marginRight: props.offset * 28 + 'px' }"
  >
    <header class="flex items-start justify-between gap-3 border-b px-5 py-3.5">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold capitalize tracking-tight">{{ heading }}</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">
          {{ tasks.length }} задач(и)
          <span v-if="overdueCount > 0" class="text-destructive">
            · {{ overdueCount }} просрочено
          </span>
        </p>
      </div>
      <button
        type="button"
        class="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label="Закрыть"
        @click="emit('close')"
      >
        <Icon name="lucide:x" class="size-4" />
      </button>
    </header>

    <div v-if="error" class="grid flex-1 place-items-center px-6 text-center">
      <div>
        <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
        <p class="mt-3 text-sm">Не удалось загрузить задачи</p>
        <button
          type="button"
          class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
          @click="refresh()"
        >
          Повторить
        </button>
      </div>
    </div>

    <div v-else-if="pending" class="space-y-2 p-4">
      <div v-for="n in 4" :key="n" class="h-14 rounded-lg bg-muted" />
    </div>

    <div v-else-if="tasks.length === 0" class="grid flex-1 place-items-center px-6 text-center">
      <div>
        <Icon name="lucide:calendar-check" class="size-7 text-muted-foreground/50" />
        <p class="mt-3 text-sm font-medium">На эту дату задач нет</p>
        <p class="mt-1 text-sm text-muted-foreground">С учётом текущих фильтров календаря.</p>
      </div>
    </div>

    <ul v-else class="flex-1 divide-y overflow-y-auto">
      <li v-for="task in tasks" :key="task.id">
        <button
          type="button"
          class="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-secondary/60"
          :class="task.deadline && new Date(task.deadline) < new Date() && !['DONE', 'APPROVED'].includes(task.status)
            ? 'bg-destructive/5'
            : ''"
          @click="openTask(task.id)"
        >
          <span class="mt-1.5 size-1.5 shrink-0 rounded-full" :class="{ 'bg-destructive': task.priority === 'URGENT', 'bg-signal': task.priority === 'HIGH', 'bg-primary': task.priority === 'NORMAL', 'bg-muted-foreground/40': task.priority === 'LOW' }" />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium leading-snug">{{ task.title }}</span>
            <span class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span v-if="task.project">{{ task.project.code }}</span>
              <span v-if="task.shot" class="font-mono">{{ task.shot.code }}</span>
              <span v-if="task.assignee">
                {{ task.assignee.firstName }} {{ task.assignee.lastName }}
              </span>
            </span>
          </span>
          <StatusBadge :status="task.status" />
        </button>
      </li>
    </ul>
  </aside>
</template>
