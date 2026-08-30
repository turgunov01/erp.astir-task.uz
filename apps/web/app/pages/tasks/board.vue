<script setup lang="ts">
import { PERMISSION, TASK_BOARD_COLUMNS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { useTaskPanels } from '~/composables/useTaskPanels'

useHead({ title: 'Board — Aster ERP' })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const canUpdate = computed(() => auth.can(PERMISSION.TASK_UPDATE))

const { openTask, openStatus } = useTaskPanels()

/**
 * A card is both draggable and clickable, so a drag must not also count as
 * a click: the pointer distance decides which one it was.
 */
const pressX = ref(0)
const pressY = ref(0)

function onPointerDown(event: PointerEvent) {
  pressX.value = event.clientX
  pressY.value = event.clientY
}

function onPointerUp(task: Task, event: PointerEvent) {
  const moved = Math.abs(event.clientX - pressX.value) + Math.abs(event.clientY - pressY.value)
  if (moved < 6) openTask(task.id)
}

const projectId = ref(String(route.query.projectId ?? ''))

const { data: projectData } = await useFetch<{ data: Array<{ id: string, code: string, name: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const projects = computed(() => projectData.value?.data ?? [])

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

const { data, pending, error, refresh } = await useFetch<{ data: Task[] }>('/api/tasks', {
  // 100 is the API ceiling on page size (spec 70). A board with more tasks
  // than that should be narrowed with the project filter rather than loaded
  // whole, so the cap is surfaced below instead of silently truncating.
  query: computed(() => ({ limit: 100, projectId: projectId.value || undefined })),
  credentials: 'include',
  default: () => ({ data: [] })
})

const tasks = computed(() => data.value?.data ?? [])
const atLimit = computed(() => tasks.value.length >= 100)

watch(projectId, value => {
  router.replace({ query: value ? { projectId: value } : {} })
})

/** BLOCKED is a flag on a task, not a column of its own (spec 17). */
const columns = computed(() =>
  TASK_BOARD_COLUMNS.map(status => ({
    status,
    label: enumLabel(TASK_STATUS_LABEL, status),
    items: tasks.value.filter(task => task.status === status)
  }))
)

const draggingId = ref('')
const busyId = ref('')
const errorMessage = ref('')

function onDragStart(task: Task, event: DragEvent) {
  if (!canUpdate.value) return
  draggingId.value = task.id
  event.dataTransfer?.setData('text/plain', task.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

/**
 * Dropping onto a column is a status change, so it goes through the same
 * endpoint as the dropdowns and inherits the dependency check: a task blocked
 * by an unfinished prerequisite is refused with the blocking names (spec 18).
 */
async function onDrop(status: string) {
  const id = draggingId.value
  draggingId.value = ''
  if (!id || !canUpdate.value) return

  const task = tasks.value.find(item => item.id === id)
  if (!task || task.status === status) return

  busyId.value = id
  errorMessage.value = ''
  try {
    await apiRequest('/api/tasks/' + id + '/status', {
      method: 'POST',
      body: {
        status,
        comment: 'Перенесено на доске: ' + task.status + ' -> ' + status
      }
    })
    await refresh()
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось перенести задачу')
  } finally {
    busyId.value = ''
  }
}

function formatDate(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function isOverdue(task: Task) {
  return Boolean(task.deadline) &&
    new Date(task.deadline as string) < new Date() &&
    !['DONE', 'APPROVED'].includes(task.status)
}
</script>

<template>
  <div class="mx-auto max-w-[1600px] px-6 py-8">
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Production
        </p>
        <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Доска задач</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ tasks.length }} задач(и)<span v-if="canUpdate"> · перетаскивайте карточки между колонками</span>
        </p>
        <p v-if="atLimit" class="mt-1 text-xs text-signal-foreground">
          Показаны первые 100 задач — сузьте выборку фильтром по проекту
        </p>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по проекту"
        >
          <option value="">Все проекты</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.code }}</option>
        </select>
        <NuxtLink
          to="/tasks"
          class="inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm hover:bg-secondary"
        >
          <Icon name="lucide:list" class="size-4" />
          Список
        </NuxtLink>
      </div>
    </header>

    <p
      v-if="errorMessage"
      role="alert"
      class="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {{ errorMessage }}
    </p>

    <div v-if="error" class="rounded-xl border bg-card px-6 py-16 text-center">
      <p class="text-sm text-muted-foreground">Не удалось загрузить доску</p>
      <button
        type="button"
        class="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <div v-else class="flex gap-4 overflow-x-auto pb-4">
      <section
        v-for="column in columns"
        :key="column.status"
        class="flex w-72 shrink-0 flex-col rounded-xl border bg-card"
        @dragover.prevent
        @drop.prevent="onDrop(column.status)"
      >
        <!--
          The header opens the column as a list. The board shows at most a
          page of tasks per column; the panel queries that status directly,
          so it is the way to see a column in full.
        -->
        <button
          type="button"
          class="flex items-center justify-between gap-2 border-b px-4 py-3 text-left hover:bg-secondary/60"
          :aria-label="'Открыть колонку ' + column.label"
          @click="openStatus({ status: column.status, projectId: projectId || undefined })"
        >
          <h2 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {{ column.label }}
          </h2>
          <span class="rounded-md bg-secondary px-1.5 py-0.5 text-xs tabular-nums">
            {{ column.items.length }}
          </span>
        </button>

        <div v-if="pending && tasks.length === 0" class="space-y-2 p-3">
          <div v-for="n in 2" :key="n" class="h-16 rounded-lg bg-muted" />
        </div>

        <p
          v-else-if="column.items.length === 0"
          class="px-4 py-8 text-center text-xs text-muted-foreground"
        >
          Пусто
        </p>

        <ul v-else class="space-y-2 p-3">
          <li
            v-for="task in column.items"
            :key="task.id"
            class="cursor-grab rounded-lg border p-3 hover:shadow-sm active:cursor-grabbing"
            :class="[
              busyId === task.id ? 'opacity-60' : '',
              isOverdue(task)
                ? 'border-destructive/50 bg-destructive/5'
                : 'border-border bg-background'
            ]"
            :draggable="canUpdate"
            @dragstart="onDragStart(task, $event)"
            @pointerdown="onPointerDown"
            @pointerup="onPointerUp(task, $event)"
          >
            <p class="text-sm font-medium leading-snug">{{ task.title }}</p>

            <p class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <NuxtLink v-if="task.project" :to="'/projects/' + task.project.id" class="hover:underline">
                {{ task.project.code }}
              </NuxtLink>
              <NuxtLink v-if="task.shot" :to="'/shots/' + task.shot.id" class="font-mono hover:underline">
                {{ task.shot.code }}
              </NuxtLink>
              <span v-if="task.dependencies.length > 0" class="inline-flex items-center gap-1">
                <Icon name="lucide:link" class="size-3" />{{ task.dependencies.length }}
              </span>
            </p>

            <div class="mt-2.5 flex items-center justify-between gap-2">
              <span v-if="task.assignee" class="truncate text-xs text-muted-foreground">
                {{ task.assignee.firstName }} {{ task.assignee.lastName }}
              </span>
              <span v-else class="text-xs text-muted-foreground">не назначен</span>

              <span
                v-if="task.deadline"
                class="shrink-0 text-xs tabular-nums"
                :class="isOverdue(task) ? 'text-destructive' : 'text-muted-foreground'"
              >
                {{ formatDate(task.deadline) }}
              </span>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
