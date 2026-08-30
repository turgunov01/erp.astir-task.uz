<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { PERMISSION, PRODUCTION_STATUS } from '@astir/types'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { SHOT_FORM } from '~/utils/entity-forms'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Shots — Aster ERP' })

const route = useRoute()
const router = useRouter()

const page = ref(Number(route.query.page ?? 1))
const search = ref(String(route.query.search ?? ''))
const status = ref(String(route.query.status ?? ''))
const projectId = ref(String(route.query.projectId ?? ''))

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.PRODUCTION_MANAGE))

// Declared before the filters that read it; useEntityCrud receives it below.
const archivedView = ref(false)

const filters = computed(() => ({
  page: page.value,
  limit: 25,
  search: search.value || undefined,
  status: status.value || undefined,
  projectId: projectId.value || undefined,
  archived: archivedView.value ? 'true' : undefined
}))

// Filters mirror into the URL so a filtered shot list is shareable (spec 89).
watch(filters, value => {
  router.replace({
    query: {
      ...(value.page > 1 ? { page: String(value.page) } : {}),
      ...(value.search ? { search: value.search } : {}),
      ...(value.status ? { status: value.status } : {}),
      ...(value.projectId ? { projectId: value.projectId } : {})
    }
  })
})

interface ShotRow {
  id: string
  code: string
  name: string | null
  status: string
  progress: number
  fps: number
  deadline: string | null
  project: { id: string, code: string, name: string } | null
  episode: { id: string, number: number } | null
  scene: { id: string, sceneNumber: number, name: string } | null
  assignee: { id: string, firstName: string, lastName: string } | null
  _count: { tasks: number, versions: number }
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<ShotRow>('/api/shots', filters as never)

const { data: projectData } = await useFetch<{ data: Array<{ id: string, code: string, name: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const projects = computed(() => projectData.value?.data ?? [])

const crud = useEntityCrud({
  endpoint: '/api/shots',
  refresh: () => refresh(),
  entityLabel: 'шот',
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns: Column[] = [
  { key: 'code', label: 'Shot', width: '18%' },
  { key: 'project', label: 'Project', width: '18%' },
  { key: 'scene', label: 'Scene', width: '18%' },
  { key: 'assignee', label: 'Artist', width: '16%' },
  { key: 'progress', label: 'Progress', width: '16%' },
  { key: 'status', label: 'Status', width: '14%' },
  { key: 'actions', label: '', width: '56px' }
]

const STATUSES = Object.values(PRODUCTION_STATUS)

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Production
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Шоты</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ meta.total }} шот(ов) во всех проектах
      </p>
    </header>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" create-label="Новый шот" :can-manage="canManage" />

    </div>


    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      search-placeholder="Поиск по коду или названию..."
      empty-icon="lucide:camera"
      empty-title="Шотов пока нет"
      empty-body="Шоты создаются внутри сцены на странице проекта."
      @update:page="page = $event"
      @update:search="page = 1"
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
        <select
          v-model="status"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по статусу"
          @change="page = 1"
        >
          <option value="">Все статусы</option>
          <option v-for="s in STATUSES" :key="s" :value="s">{{ enumLabel(PRODUCTION_STATUS_LABEL, s) }}</option>
        </select>
      </template>

      <template #cell-code="{ row }">
        <NuxtLink :to="'/shots/' + row.id" class="font-mono text-sm font-medium hover:underline">
          {{ row.code }}
        </NuxtLink>
        <p class="mt-0.5 text-xs text-muted-foreground">
          {{ row.fps }} fps · {{ row._count.versions }} версий
        </p>
      </template>

      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-scene="{ row }">
        <span v-if="row.scene" class="truncate">{{ row.scene.name }}</span>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-assignee="{ row }">
        <span v-if="row.assignee">{{ row.assignee.firstName }} {{ row.assignee.lastName }}</span>
        <span v-else class="text-muted-foreground">не назначен</span>
      </template>

      <template #cell-progress="{ row }">
        <ProgressBar :value="row.progress" />
      </template>

      <template #cell-status="{ row }">
        <StatusBadge :status="row.status" />
      </template>
          <template #cell-actions="{ row }">
        <EntityRowActions
          :archived="archivedView"
          :can-manage="canManage"
          :busy="crud.busyId === row.id"
          @edit="crud.openEdit(row)"
          @archive="crud.archive(row)"
          @unarchive="crud.unarchive(row)"
          @delete="crud.askDelete(row)"
        />
      </template>
    </DataTable>

    <EntityCrudHost :crud="crud" :config="SHOT_FORM" />
  </div>
</template>
