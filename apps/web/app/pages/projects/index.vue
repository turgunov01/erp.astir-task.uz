<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { PERMISSION, PROJECT_STATUS } from '@astir/types'

const { t } = useI18n()

useHead({ title: computed(() => t('projects.list.title')) })

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
  get entityLabel() { return t('projects.list.entity') },
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns = computed<Column[]>(() => [
  { key: 'code', label: t('projects.list.columns.code'), width: '10%' },
  { key: 'name', label: t('projects.list.columns.name'), width: '26%' },
  { key: 'client', label: t('projects.list.columns.client'), width: '16%' },
  { key: 'status', label: t('projects.list.columns.status'), width: '14%' },
  { key: 'progress', label: t('projects.list.columns.progress'), width: '16%' },
  { key: 'deadline', label: t('projects.list.columns.deadline'), width: '12%' },
  { key: 'risk', label: t('projects.list.columns.risk'), width: '10%' },
  { key: 'actions', label: '', width: '56px' }
])

const STATUS_OPTIONS = Object.values(PROJECT_STATUS)

function isOverdue(deadline: string | null, progress: number) {
  return Boolean(deadline) && new Date(deadline as string) < new Date() && progress < 100
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('projects.list.eyebrow') }}
        </p>
        <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('projects.list.title') }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t('projects.list.total', meta.total) }}
        </p>
      </div>
      <EntityToolbar
        :crud="crud"
        :create-label="t('projects.list.newProject')"
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
      :search-placeholder="t('projects.list.searchPlaceholder')"
      empty-icon="lucide:folder-kanban"
      :empty-title="t('projects.list.emptyTitle')"
      :empty-body="t('projects.list.emptyBody')"
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
          <option value="">{{ t('projects.list.allStatuses') }}</option>
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
          {{ countLabel(row._count.shots, 'projects.count.shots') }} · {{ countLabel(row._count.tasks, 'common.count.tasks') }}
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
          {{ fullDay(row.deadline) }}
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
