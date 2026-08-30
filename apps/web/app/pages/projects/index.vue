<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { PERMISSION, PROJECT_STATUS } from '@astir/types'

useHead({ title: 'Projects — Aster ERP' })

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

// Filters live in the URL so a filtered view is shareable (spec 89).
const page = ref(Number(route.query.page ?? 1))
const search = ref(String(route.query.search ?? ''))
const status = ref(String(route.query.status ?? ''))

// Declared before the filters that read it; useEntityCrud receives it below.
const archivedView = ref(false)

const canManage = computed(() => auth.can(PERMISSION.PROJECT_UPDATE))

const filters = computed(() => ({
  page: page.value,
  limit: 20,
  search: search.value || undefined,
  status: status.value || undefined,
  archived: archivedView.value ? 'true' : undefined
}))

watch(filters, value => {
  router.replace({
    query: {
      ...(value.page > 1 ? { page: String(value.page) } : {}),
      ...(value.search ? { search: value.search } : {}),
      ...(value.status ? { status: value.status } : {})
    }
  })
})

interface ProjectRow {
  id: string
  code: string
  name: string
  status: string
  priority: string
  progress: number
  risk: string
  deadline: string | null
  currency: string
  client: { id: string, name: string } | null
  projectManager: { firstName: string, lastName: string } | null
  _count: { episodes: number, shots: number, tasks: number }
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<ProjectRow>('/api/projects', filters as never)

const crud = useEntityCrud({
  endpoint: '/api/projects',
  refresh: () => refresh(),
  entityLabel: 'проект',
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns: Column[] = [
  { key: 'code', label: 'Code', width: '10%' },
  { key: 'name', label: 'Project', width: '26%' },
  { key: 'client', label: 'Client', width: '16%' },
  { key: 'status', label: 'Status', width: '14%' },
  { key: 'progress', label: 'Progress', width: '16%' },
  { key: 'deadline', label: 'Deadline', width: '12%' },
  { key: 'risk', label: 'Risk', width: '10%' },
  { key: 'actions', label: '', width: '56px' }
]

const STATUS_OPTIONS = Object.values(PROJECT_STATUS)

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

function isOverdue(deadline: string | null, progress: number) {
  return Boolean(deadline) && new Date(deadline as string) < new Date() && progress < 100
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Projects
        </p>
        <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Проекты</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ meta.total }} проект(ов) в системе
        </p>
      </div>
      <EntityToolbar
        :crud="crud"
        create-label="Новый проект"
        create-to="/projects/create"
        :can-manage="auth.can(PERMISSION.PROJECT_CREATE)"
      />
    </header>

    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      search-placeholder="Поиск по названию или коду..."
      empty-icon="lucide:folder-kanban"
      empty-title="Пока нет проектов"
      empty-body="Создайте первый проект, чтобы начать отслеживать производство."
      @update:page="page = $event"
      @update:search="page = 1"
      @retry="refresh"
    >
      <template #toolbar>
        <select
          v-model="status"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          @change="page = 1"
        >
          <option value="">Все статусы</option>
          <option v-for="option in STATUS_OPTIONS" :key="option" :value="option">
            {{ enumLabel(PROJECT_STATUS_LABEL, option) }}
          </option>
        </select>
      </template>

      <template #cell-code="{ row }">
        <NuxtLink :to="'/projects/' + row.id" class="font-medium tabular-nums hover:underline">
          {{ row.code }}
        </NuxtLink>
      </template>

      <template #cell-name="{ row }">
        <NuxtLink :to="'/projects/' + row.id" class="font-medium hover:underline">
          {{ row.name }}
        </NuxtLink>
        <p class="mt-0.5 text-xs text-muted-foreground">
          {{ row._count.shots }} шотов · {{ row._count.tasks }} задач
        </p>
      </template>

      <template #cell-client="{ row }">
        {{ row.client?.name ?? '—' }}
      </template>

      <template #cell-status="{ row }">
        <StatusBadge :status="row.status" />
      </template>

      <template #cell-progress="{ row }">
        <ProgressBar :value="row.progress" :risk="row.risk" />
      </template>

      <template #cell-deadline="{ row }">
        <span :class="isOverdue(row.deadline, row.progress) ? 'text-destructive' : ''">
          {{ formatDate(row.deadline) }}
        </span>
      </template>

      <template #cell-risk="{ row }">
        <StatusBadge :status="row.risk" kind="risk" />
      </template>

      <template #cell-actions="{ row }">
        <EntityRowActions
          :name="row.name"
          :archived="archivedView"
          :can-manage="canManage"
          :busy="crud.busyId === row.id"
          @edit="navigateTo('/projects/' + row.id + '/edit')"
          @archive="crud.archive(row)"
          @unarchive="crud.unarchive(row)"
          @delete="crud.askDelete(row)"
        />
      </template>
    </DataTable>

    <EntityCrudHost :crud="crud" />
  </div>
</template>
