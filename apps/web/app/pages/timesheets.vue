<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource, apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Учёт времени — Aster ERP' })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { openTask } = useTaskPanels()

const canSubmit = computed(() => auth.can(PERMISSION.TIMESHEET_SUBMIT))
const canSeeTeam = computed(() => auth.can(PERMISSION.TIMESHEET_VIEW_ALL))

/**
 * Views live in a query parameter rather than in sibling routes.
 *
 * The spec lists /timesheets/my, /team, /projects and /reports, but four routes
 * would each need a page of their own to avoid a dead link; one page with a
 * shareable ?view= keeps every URL working.
 */
const VIEWS = [
  { key: 'my', label: 'Мои часы', teamOnly: false },
  { key: 'team', label: 'Команда', teamOnly: true },
  { key: 'projects', label: 'По проектам', teamOnly: true },
  { key: 'reports', label: 'Отчёт', teamOnly: true }
] as const

const availableViews = computed(() =>
  VIEWS.filter(item => !item.teamOnly || canSeeTeam.value)
)

const view = computed(() => {
  const requested = String(route.query.view ?? 'my')
  return availableViews.value.some(item => item.key === requested) ? requested : 'my'
})

const page = ref(1)
const projectId = ref('')
const from = ref('')
const to = ref('')
const errorMessage = ref('')

function selectView(key: string) {
  page.value = 1
  router.replace({ query: key === 'my' ? {} : { view: key } })
}

const filters = computed(() => ({
  page: page.value,
  limit: 20,
  mine: view.value === 'my' ? 'true' : undefined,
  projectId: projectId.value || undefined,
  from: from.value || undefined,
  to: to.value || undefined
}))

interface EntryRow {
  id: string
  date: string
  hours: number
  description: string | null
  employee: {
    id: string
    position: string
    user: { firstName: string, lastName: string }
  } | null
  project: { id: string, code: string, name: string } | null
  task: { id: string, title: string } | null
  shot: { id: string, code: string } | null
}

const { items, meta, pending, errorMessage: loadError, refresh } =
  useListResource<EntryRow>('/api/timesheets', filters as never)

interface Summary {
  totalHours: number
  entries: number
  byProject: Array<{
    project: { id: string, code: string, name: string } | null
    hours: number
    entries: number
  }>
  byEmployee: Array<{
    employee: { id: string, position: string, user: { firstName: string, lastName: string } } | null
    hours: number
    entries: number
  }>
}

const { data: summaryData, refresh: refreshSummary } = await useFetch<{ data: Summary }>(
  '/api/timesheets/summary',
  {
    query: computed(() => ({
      mine: view.value === 'my' ? 'true' : undefined,
      projectId: projectId.value || undefined,
      from: from.value || undefined,
      to: to.value || undefined
    })),
    credentials: 'include',
    default: () => ({ data: { totalHours: 0, entries: 0, byProject: [], byEmployee: [] } })
  }
)

const summary = computed(() => summaryData.value?.data)

const { data: projectData } = await useFetch<{
  data: Array<{ id: string, code: string, name: string }>
}>('/api/projects', {
  query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] })
})
const projects = computed(() => projectData.value?.data ?? [])

const columns: Column[] = [
  { key: 'date', label: 'Дата', width: '12%' },
  { key: 'who', label: 'Сотрудник', width: '20%' },
  { key: 'project', label: 'Проект', width: '14%' },
  { key: 'work', label: 'Работа', width: '32%' },
  { key: 'hours', label: 'Часы', width: '10%', numeric: true },
  { key: 'actions', label: '', width: '56px' }
]

// --- logging hours ---------------------------------------------------------

const formOpen = ref(false)
const saving = ref(false)
const draft = reactive({
  projectId: '',
  taskId: '',
  date: new Date().toISOString().slice(0, 10),
  hours: '',
  description: ''
})

const { data: taskData } = await useFetch<{
  data: Array<{ id: string, title: string, projectId: string }>
}>('/api/tasks', {
  query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] })
})

/** Only tasks of the chosen project, so the pair cannot contradict itself. */
const tasksForProject = computed(() =>
  (taskData.value?.data ?? []).filter(
    task => !draft.projectId || task.projectId === draft.projectId
  )
)

async function submit() {
  if (!draft.projectId || !draft.date || !draft.hours) {
    errorMessage.value = 'Заполните проект, дату и количество часов'
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    await apiRequest('/api/timesheets', {
      method: 'POST',
      body: {
        projectId: draft.projectId,
        taskId: draft.taskId || null,
        date: draft.date,
        hours: Number(draft.hours),
        description: draft.description.trim() || null
      }
    })
    draft.hours = ''
    draft.description = ''
    draft.taskId = ''
    formOpen.value = false
    await Promise.all([refresh(), refreshSummary()])
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось записать часы')
  } finally {
    saving.value = false
  }
}

const deleteTarget = ref<EntryRow | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  const row = deleteTarget.value
  if (!row) return
  deleting.value = true
  try {
    await apiRequest('/api/timesheets/' + row.id, { method: 'DELETE' })
    deleteTarget.value = null
    await Promise.all([refresh(), refreshSummary()])
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось удалить запись')
    deleteTarget.value = null
  } finally {
    deleting.value = false
  }
}

function who(row: EntryRow) {
  return row.employee
    ? row.employee.user.firstName + ' ' + row.employee.user.lastName
    : '—'
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Планирование
      </p>
      <div class="mt-1.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Учёт времени</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ summary?.totalHours ?? 0 }}ч за период · {{ summary?.entries ?? 0 }} записей
          </p>
        </div>
        <button
          v-if="canSubmit"
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          @click="formOpen = !formOpen"
        >
          <Icon :name="formOpen ? 'lucide:x' : 'lucide:plus'" class="size-4" />
          {{ formOpen ? 'Свернуть' : 'Списать часы' }}
        </button>
      </div>
    </header>

    <nav class="mb-5 flex flex-wrap gap-1.5" aria-label="Выборки учёта времени">
      <button
        v-for="item in availableViews"
        :key="item.key"
        type="button"
        class="rounded-md px-3 py-1.5 text-sm"
        :class="view === item.key
          ? 'bg-secondary font-medium text-secondary-foreground'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'"
        @click="selectView(item.key)"
      >
        {{ item.label }}
      </button>
    </nav>

    <p
      v-if="errorMessage"
      role="alert"
      class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {{ errorMessage }}
    </p>

    <section v-if="formOpen" class="mb-5 rounded-xl border bg-card p-4">
      <h2 class="text-sm font-medium">Новая запись</h2>
      <div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label for="ts-project" class="mb-1.5 block text-sm font-medium leading-none">
            Проект <span class="text-destructive">*</span>
          </label>
          <select
            id="ts-project"
            v-model="draft.projectId"
            class="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
            <option value="">Не выбран</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">
              {{ p.code }} · {{ p.name }}
            </option>
          </select>
        </div>
        <div>
          <label for="ts-task" class="mb-1.5 block text-sm font-medium leading-none">Задача</label>
          <select
            id="ts-task"
            v-model="draft.taskId"
            class="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
            <option value="">Без задачи</option>
            <option v-for="t in tasksForProject" :key="t.id" :value="t.id">{{ t.title }}</option>
          </select>
        </div>
        <div>
          <label for="ts-date" class="mb-1.5 block text-sm font-medium leading-none">
            Дата <span class="text-destructive">*</span>
          </label>
          <input
            id="ts-date"
            v-model="draft.date"
            type="date"
            class="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
          >
        </div>
        <div>
          <label for="ts-hours" class="mb-1.5 block text-sm font-medium leading-none">
            Часы <span class="text-destructive">*</span>
          </label>
          <input
            id="ts-hours"
            v-model="draft.hours"
            type="number"
            step="0.25"
            min="0.25"
            max="24"
            placeholder="7.5"
            class="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
          >
        </div>
        <div class="sm:col-span-2 lg:col-span-4">
          <label for="ts-note" class="mb-1.5 block text-sm font-medium leading-none">
            Что делали
          </label>
          <textarea
            id="ts-note"
            v-model="draft.description"
            rows="2"
            class="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          />
        </div>
      </div>
      <div class="mt-3 flex justify-end">
        <button
          type="button"
          class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          :disabled="saving"
          @click="submit"
        >
          {{ saving ? 'Сохранение...' : 'Записать' }}
        </button>
      </div>
    </section>

    <!-- Reporting views summarise instead of listing every entry. -->
    <section v-if="view === 'projects' || view === 'reports'" class="mb-5 grid gap-4 lg:grid-cols-2">
      <div class="rounded-xl border bg-card p-4">
        <h2 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          По проектам
        </h2>
        <p v-if="(summary?.byProject.length ?? 0) === 0" class="mt-3 text-sm text-muted-foreground">
          За период часов нет.
        </p>
        <ul v-else class="mt-3 space-y-2">
          <li
            v-for="row in summary?.byProject"
            :key="row.project?.id ?? 'none'"
            class="flex items-center justify-between gap-3 text-sm"
          >
            <span class="min-w-0 truncate">
              {{ row.project ? row.project.code + ' · ' + row.project.name : 'Без проекта' }}
            </span>
            <span class="shrink-0 tabular-nums">
              {{ row.hours }}ч
              <span class="text-xs text-muted-foreground">({{ row.entries }})</span>
            </span>
          </li>
        </ul>
      </div>

      <div class="rounded-xl border bg-card p-4">
        <h2 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          По сотрудникам
        </h2>
        <p v-if="(summary?.byEmployee.length ?? 0) === 0" class="mt-3 text-sm text-muted-foreground">
          За период часов нет.
        </p>
        <ul v-else class="mt-3 space-y-2">
          <li
            v-for="row in summary?.byEmployee"
            :key="row.employee?.id ?? 'none'"
            class="flex items-center justify-between gap-3 text-sm"
          >
            <span class="min-w-0 truncate">
              {{ row.employee
                ? row.employee.user.firstName + ' ' + row.employee.user.lastName
                : 'Неизвестен' }}
            </span>
            <span class="shrink-0 tabular-nums">
              {{ row.hours }}ч
              <span class="text-xs text-muted-foreground">({{ row.entries }})</span>
            </span>
          </li>
        </ul>
      </div>
    </section>

    <DataTable
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="loadError"
      search-placeholder="Поиск недоступен в этом разделе"
      empty-icon="lucide:clock"
      empty-title="Записей нет"
      empty-body="Списанные часы формируют фактическую себестоимость проекта."
      @update:page="page = $event"
      @retry="refresh"
    >
      <template #toolbar>
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по проекту"
          @change="page = 1"
        >
          <option value="">Все проекты</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.code }}</option>
        </select>
        <input
          v-model="from"
          type="date"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Период с"
          @change="page = 1"
        >
        <input
          v-model="to"
          type="date"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Период по"
          @change="page = 1"
        >
      </template>

      <template #cell-date="{ row }">
        <span class="tabular-nums">{{ formatDay(row.date) }}</span>
      </template>

      <template #cell-who="{ row }">
        <p>{{ who(row) }}</p>
        <p v-if="row.employee" class="mt-0.5 text-xs text-muted-foreground">
          {{ row.employee.position }}
        </p>
      </template>

      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-work="{ row }">
        <button
          v-if="row.task"
          type="button"
          class="text-left font-medium hover:underline"
          @click="openTask(row.task.id)"
        >
          {{ row.task.title }}
        </button>
        <p v-if="row.description" class="mt-0.5 text-xs text-muted-foreground">
          {{ row.description }}
        </p>
        <span v-if="!row.task && !row.description" class="text-muted-foreground">—</span>
      </template>

      <template #cell-hours="{ row }">
        <span class="font-medium tabular-nums">{{ row.hours }}</span>
      </template>

      <template #cell-actions="{ row }">
        <button
          v-if="canSubmit"
          type="button"
          class="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
          :aria-label="'Удалить запись за ' + formatDay(row.date)"
          data-row-ignore
          @click="deleteTarget = row"
        >
          <Icon name="lucide:trash-2" class="size-4" />
        </button>
      </template>
    </DataTable>

    <ConfirmDialog
      v-if="deleteTarget"
      title="Удаление записи"
      :message="'Удалить ' + deleteTarget.hours + 'ч за ' + formatDay(deleteTarget.date) + '?'"
      detail="Часы исчезнут из отчётов и себестоимости проекта."
      confirm-label="Удалить"
      :pending="deleting"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
