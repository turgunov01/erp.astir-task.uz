<script setup lang="ts">
import { PERMISSION, PRIORITY, TASK_STATUS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { useAuthStore } from '~/stores/auth'

const props = defineProps<{
  status: string
  projectId?: string
  /** Depth in the stack; deeper panels sit slightly further left. */
  offset: number
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const auth = useAuthStore()
const canUpdate = computed(() => auth.can(PERMISSION.TASK_UPDATE))
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
  dependencies: Array<{ dependsOnTask: { id: string, title: string, status: string } }>
}

/**
 * The column filtered server-side, not sliced from the board's page of 100:
 * a column can hold more than fits in that window, and the panel exists
 * precisely to see all of it.
 */
const { data, pending, error, refresh } = await useFetch<{ data: Task[] }>('/api/tasks', {
  query: computed(() => ({
    status: props.status,
    projectId: props.projectId || undefined,
    limit: 100
  })),
  credentials: 'include',
  default: () => ({ data: [] })
})

const tasks = computed(() => data.value?.data ?? [])

const busyId = ref('')
const errorMessage = ref('')

const STATUSES = Object.values(TASK_STATUS)
const PRIORITIES = Object.values(PRIORITY)

const label = computed(() => props.status.split('_').join(' '))

const overdue = computed(() =>
  tasks.value.filter(task =>
    task.deadline &&
    new Date(task.deadline) < new Date() &&
    !['DONE', 'APPROVED'].includes(task.status)
  ).length
)

const unassigned = computed(() => tasks.value.filter(task => !task.assignee).length)

/** Moving a task out of this column removes it from the list on refresh. */
async function moveTo(task: Task, status: string) {
  busyId.value = task.id
  errorMessage.value = ''
  try {
    await apiRequest('/api/tasks/' + task.id + '/status', {
      method: 'POST',
      body: { status, comment: 'Перенесено из панели статуса: ' + task.status + ' -> ' + status }
    })
    await refresh()
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось изменить статус')
  } finally {
    busyId.value = ''
  }
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function isOverdue(task: Task) {
  return Boolean(task.deadline) &&
    new Date(task.deadline as string) < new Date() &&
    !['DONE', 'APPROVED'].includes(task.status)
}

function priorityDot(value: string) {
  if (value === 'URGENT') return 'bg-destructive'
  if (value === 'HIGH') return 'bg-signal'
  if (value === 'NORMAL') return 'bg-primary'
  return 'bg-muted-foreground/40'
}
</script>

<template>
  <aside
    class="drawer-panel pointer-events-auto relative flex h-full w-full max-w-lg flex-col border-l bg-background shadow-xl"
    :style="{ marginRight: props.offset * 28 + 'px' }"
    role="dialog"
    aria-modal="true"
    :aria-label="'Задачи в статусе ' + label"
  >
    <header class="flex items-start justify-between gap-3 border-b px-5 py-3.5">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <StatusBadge :status="props.status" />
          <span class="text-xs tabular-nums text-muted-foreground">{{ tasks.length }}</span>
        </div>
        <p class="mt-1.5 text-xs text-muted-foreground">
          <template v-if="overdue > 0">
            <span class="text-destructive">{{ overdue }} просрочено</span>
            <span v-if="unassigned > 0"> · </span>
          </template>
          <template v-if="unassigned > 0">{{ unassigned }} без исполнителя</template>
          <template v-if="overdue === 0 && unassigned === 0">все задачи назначены и в срок</template>
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

    <p
      v-if="errorMessage"
      role="alert"
      class="border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive"
    >
      {{ errorMessage }}
    </p>

    <div v-if="error" class="grid flex-1 place-items-center px-6 text-center">
      <div>
        <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
        <p class="mt-3 text-sm">Не удалось загрузить колонку</p>
        <button
          type="button"
          class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
          @click="refresh()"
        >
          Повторить
        </button>
      </div>
    </div>

    <div v-else-if="pending && tasks.length === 0" class="space-y-2 p-4">
      <div v-for="n in 5" :key="n" class="h-16 rounded-lg bg-muted" />
    </div>

    <div v-else-if="tasks.length === 0" class="grid flex-1 place-items-center px-6 text-center">
      <div>
        <Icon name="lucide:inbox" class="size-7 text-muted-foreground/50" />
        <p class="mt-3 text-sm font-medium">В этой колонке пусто</p>
        <p class="mt-1 text-sm text-muted-foreground">
          Перетащите сюда карточку на доске или смените статус задачи.
        </p>
      </div>
    </div>

    <ul v-else class="flex-1 divide-y overflow-y-auto">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="px-5 py-3"
        :class="[
          busyId === task.id ? 'opacity-60' : '',
          isOverdue(task) ? 'bg-destructive/5' : ''
        ]"
      >
        <div class="flex items-start gap-2.5">
          <span class="mt-1.5 size-1.5 shrink-0 rounded-full" :class="priorityDot(task.priority)" />

          <div class="min-w-0 flex-1">
            <button
              type="button"
              class="block max-w-full truncate text-left text-sm font-medium hover:underline"
              @click="openTask(task.id)"
            >
              {{ task.title }}
            </button>
            <p class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span v-if="task.project">{{ task.project.code }}</span>
              <span v-if="task.shot" class="font-mono">{{ task.shot.code }}</span>
              <span v-if="task.assignee">
                {{ task.assignee.firstName }} {{ task.assignee.lastName }}
              </span>
              <span v-else class="italic">не назначен</span>
              <span v-if="task.dependencies.length > 0" class="inline-flex items-center gap-1">
                <Icon name="lucide:link" class="size-3" />{{ task.dependencies.length }}
              </span>
            </p>
          </div>

          <span class="shrink-0 text-xs tabular-nums" :class="isOverdue(task) ? 'text-destructive' : 'text-muted-foreground'">
            {{ formatDate(task.deadline) }}
          </span>
        </div>

        <select
          v-if="canUpdate"
          :value="task.status"
          :disabled="busyId === task.id"
          class="mt-2 h-7 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          :aria-label="'Перенести задачу ' + task.title"
          @change="moveTo(task, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="s in STATUSES" :key="s" :value="s">{{ s.split('_').join(' ') }}</option>
        </select>
      </li>
    </ul>
  </aside>
</template>
