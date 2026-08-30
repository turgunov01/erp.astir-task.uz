<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource, apiErrorMessage, apiRequest } from '~/composables/useApi'
import { PERMISSION, PRIORITY, TASK_STATUS } from '@astir/types'
import { useAuthStore } from '~/stores/auth'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { useEntityCrud } from '~/composables/useEntityCrud'

useHead({ title: 'Tasks — Aster ERP' })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const canCreate = computed(() => auth.can(PERMISSION.TASK_CREATE))
// Editing, archiving and deleting a task all sit behind the update right.
const canManage = computed(() => auth.can(PERMISSION.TASK_UPDATE))

const { openTask, setStack } = useTaskPanels()

/** Saved views (spec 16) as one shareable query param. */
const VIEWS = [
  { key: 'all', label: 'Все' },
  { key: 'my', label: 'Мои' },
  { key: 'overdue', label: 'Просроченные' },
  { key: 'review', label: 'На согласовании' },
  { key: 'completed', label: 'Завершённые' },
  { key: 'archived', label: 'Архив' }
] as const

const view = computed(() => {
  const requested = String(route.query.view ?? 'all')
  return VIEWS.some(item => item.key === requested) ? requested : 'all'
})

const page = ref(Number(route.query.page ?? 1))
const search = ref(String(route.query.search ?? ''))
const projectId = ref(String(route.query.projectId ?? ''))
const assigneeId = ref(String(route.query.assigneeId ?? ''))
const priority = ref(String(route.query.priority ?? ''))

/** A ?task= link still opens that task, by seeding the shared panel stack. */
onMounted(() => {
  const deepLink = String(route.query.task ?? '')
  if (deepLink) setStack([{ kind: 'task', id: deepLink }])
})

const filters = computed(() => {
  const base: Record<string, string | number | boolean | undefined> = {
    page: page.value,
    limit: 25,
    search: search.value || undefined,
    projectId: projectId.value || undefined,
    assigneeId: assigneeId.value || undefined,
    priority: priority.value || undefined
  }
  if (view.value === 'my') base.mine = true
  if (view.value === 'overdue') base.overdue = true
  if (view.value === 'review') base.status = TASK_STATUS.REVIEW
  if (view.value === 'completed') base.status = TASK_STATUS.DONE
  if (view.value === 'archived') base.archived = true
  return base
})

function updateQuery(patch: Record<string, string | undefined>) {
  const next: Record<string, string> = {}
  const current = {
    view: view.value === 'all' ? undefined : view.value,
    search: search.value || undefined,
    projectId: projectId.value || undefined,
    assigneeId: assigneeId.value || undefined,
    priority: priority.value || undefined,
    ...patch
  }
  for (const [key, value] of Object.entries(current)) {
    if (value) next[key] = value
  }
  router.replace({ query: next })
}

function selectView(key: string) {
  page.value = 1
  updateQuery({ view: key === 'all' ? undefined : key })
}

interface TaskRow {
  id: string
  title: string
  status: string
  priority: string
  deadline: string | null
  project: { id: string, code: string } | null
  shot: { id: string, code: string } | null
  stage: { id: string, name: string } | null
  assignee: { id: string, firstName: string, lastName: string } | null
  dependencies: Array<{ dependsOnTask: { id: string, title: string, status: string } }>
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<TaskRow>('/api/tasks', filters as never)

const { data: projectData } = await useFetch<{ data: Array<{ id: string, code: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const { data: staffData } = await useFetch<{
  data: Array<{ userId: string, user: { firstName: string, lastName: string } }>
}>('/api/employees', { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) })

const projects = computed(() => projectData.value?.data ?? [])
const staff = computed(() => staffData.value?.data ?? [])

const crud = useEntityCrud({
  endpoint: '/api/tasks',
  refresh: () => refresh(),
  entityLabel: 'задачу',
  archivedView: computed({
    get: () => view.value === 'archived',
    set: value => selectView(value ? 'archived' : 'all')
  })
})

const columns: Column[] = [
  { key: 'title', label: 'Task', width: '34%' },
  { key: 'project', label: 'Project', width: '11%' },
  { key: 'assignee', label: 'Assignee', width: '17%' },
  { key: 'deadline', label: 'Deadline', width: '13%' },
  { key: 'priority', label: 'Priority', width: '12%' },
  { key: 'status', label: 'Status', width: '13%' },
  { key: 'actions', label: '', width: '56px' }
]

const PRIORITIES = Object.values(PRIORITY)

// Creation happens in a modal so every field can be filled at once,
// instead of a one-line row that leaves the task half-specified.
const showCreate = ref(false)

async function onCreated(id: string) {
  await refresh()
  updateQuery({ task: id })
}



function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function isOverdue(row: TaskRow) {
  return Boolean(row.deadline) &&
    new Date(row.deadline as string) < new Date() &&
    !['DONE', 'APPROVED'].includes(row.status)
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Production
        </p>
        <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Задачи</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ meta.total }} задач(и)</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="canCreate"
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          @click="showCreate = true"
        >
          <Icon name="lucide:plus" class="size-4" />
          Новая задача
        </button>
        <NuxtLink
          to="/tasks/calendar"
          class="inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm hover:bg-secondary"
        >
          <Icon name="lucide:calendar" class="size-4" />
          Календарь
        </NuxtLink>
        <NuxtLink
          to="/tasks/board"
          class="inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm hover:bg-secondary"
        >
          <Icon name="lucide:columns-3" class="size-4" />
          Доска
        </NuxtLink>
      </div>
    </header>

    <nav class="mb-5 flex flex-wrap gap-1.5" aria-label="Быстрые выборки">
      <button
        v-for="item in VIEWS"
        :key="item.key"
        type="button"
        class="rounded-md px-3 py-1.5 text-sm"
        :class="view === item.key ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'"
        @click="selectView(item.key)"
      >
        {{ item.label }}
      </button>
    </nav>

    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      search-placeholder="Поиск по названию..."
      empty-icon="lucide:list-checks"
      :empty-title="view === 'archived' ? 'Архив пуст' : 'Задач нет'"
      :empty-body="view === 'archived'
        ? 'Архивированные задачи появятся здесь и их можно вернуть в работу.'
        : 'В этой выборке пока ничего нет. Создайте задачу кнопкой сверху.'"
      @update:page="page = $event"
      @update:search="page = 1"
      @retry="refresh"
    >
      <template #toolbar>
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по проекту"
          @change="page = 1; updateQuery({ projectId: projectId || undefined })"
        >
          <option value="">Все проекты</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.code }}</option>
        </select>

        <select
          v-model="assigneeId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по исполнителю"
          @change="page = 1; updateQuery({ assigneeId: assigneeId || undefined })"
        >
          <option value="">Все исполнители</option>
          <option v-for="s in staff" :key="s.userId" :value="s.userId">
            {{ s.user.firstName }} {{ s.user.lastName }}
          </option>
        </select>

        <select
          v-model="priority"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по приоритету"
          @change="page = 1; updateQuery({ priority: priority || undefined })"
        >
          <option value="">Любой приоритет</option>
          <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
        </select>
      </template>

      <template #cell-title="{ row }">
        <span
          v-if="isOverdue(row)"
          class="mr-2 inline-block size-1.5 rounded-full bg-destructive align-middle"
          aria-hidden="true"
        />
        <button
          type="button"
          class="text-left font-medium hover:underline"
          :class="isOverdue(row) ? 'text-destructive' : ''"
          @click="openTask(row.id)"
        >
          {{ row.title }}
        </button>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span v-if="row.stage">{{ row.stage.name }}</span>
          <NuxtLink v-if="row.shot" :to="'/shots/' + row.shot.id" class="font-mono hover:underline">
            {{ row.shot.code }}
          </NuxtLink>
          <span v-if="row.dependencies.length > 0" class="inline-flex items-center gap-1">
            <Icon name="lucide:link" class="size-3" />{{ row.dependencies.length }}
          </span>
        </p>
      </template>

      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-assignee="{ row }">
        <span v-if="row.assignee">{{ row.assignee.firstName }} {{ row.assignee.lastName }}</span>
        <span v-else class="text-muted-foreground">не назначен</span>
      </template>

      <template #cell-deadline="{ row }">
        <span :class="isOverdue(row) ? 'text-destructive' : ''">{{ formatDate(row.deadline) }}</span>
      </template>

      <template #cell-priority="{ row }">
        <StatusBadge :status="row.priority" kind="risk" />
      </template>

      <template #cell-status="{ row }">
        <StatusBadge :status="row.status" />
      </template>
          <template #cell-actions="{ row }">
        <EntityRowActions
          :name="row.title"
          :archived="view === 'archived'"
          :can-manage="canManage"
          :busy="crud.busyId === row.id"
          @edit="openTask(row.id)"
          @archive="crud.archive(row)"
          @unarchive="crud.unarchive(row)"
          @delete="crud.askDelete(row)"
        />
      </template>
    </DataTable>

    <EntityCrudHost :crud="crud" />

    <TaskCreateModal
      v-if="showCreate"
      @close="showCreate = false"
      @created="onCreated"
    />

  </div>
</template>
