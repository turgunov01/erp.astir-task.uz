<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { PERMISSION, PRODUCTION_STATUS } from '@astir/types'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { SCENE_FORM } from '~/utils/entity-forms'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Scenes — Aster ERP' })

const route = useRoute()
const page = ref(Number(route.query.page ?? 1))
const search = ref(String(route.query.search ?? ''))
const projectId = ref(String(route.query.projectId ?? ''))
const status = ref('')

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.PRODUCTION_MANAGE))

// Declared before the filters that read it; useEntityCrud receives it below.
const archivedView = ref(false)

const filters = computed(() => ({
  page: page.value,
  limit: 25,
  search: search.value || undefined,
  projectId: projectId.value || undefined,
  status: status.value || undefined,
  archived: archivedView.value ? 'true' : undefined
}))

interface SceneRow {
  id: string
  sceneNumber: number
  name: string
  status: string
  progress: number
  project: { id: string, code: string, name: string } | null
  episode: { id: string, number: number, title: string } | null
  _count: { shots: number, tasks: number }
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<SceneRow>('/api/scenes', filters as never)

const { data: projectData } = await useFetch<{ data: Array<{ id: string, code: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const projects = computed(() => projectData.value?.data ?? [])

const crud = useEntityCrud({
  endpoint: '/api/scenes',
  refresh: () => refresh(),
  entityLabel: 'сцену',
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns: Column[] = [
  { key: 'code', label: 'Scene', width: '26%' },
  { key: 'project', label: 'Project', width: '14%' },
  { key: 'episode', label: 'Episode', width: '16%' },
  { key: 'shots', label: 'Shots', width: '10%', numeric: true },
  { key: 'progress', label: 'Progress', width: '18%' },
  { key: 'status', label: 'Status', width: '16%' },
  { key: 'actions', label: '', width: '56px' }
]

const STATUSES = Object.values(PRODUCTION_STATUS)

function pad(value: number) {
  return String(value).padStart(2, '0')
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Production</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Сцены</h1>
      <p class="mt-1 text-sm text-muted-foreground">{{ meta.total }} сцен(ы)</p>
    </header>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" create-label="Новая сцена" :can-manage="canManage" />

    </div>


    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      search-placeholder="Поиск по названию..."
      empty-icon="lucide:film"
      empty-title="Сцен пока нет"
      empty-body="Сцены создаются на странице проекта во вкладке «Сцены»."
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
        <span class="mr-2 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums">
          <template v-if="row.episode">EP{{ pad(row.episode.number) }}_</template>SC{{ pad(row.sceneNumber) }}
        </span>
        <span class="font-medium">{{ row.name }}</span>
      </template>

      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-episode="{ row }">
        <span v-if="row.episode" class="truncate">{{ row.episode.title }}</span>
        <span v-else class="text-muted-foreground">без эпизода</span>
      </template>

      <template #cell-shots="{ row }">{{ row._count.shots }}</template>
      <template #cell-progress="{ row }"><ProgressBar :value="row.progress" /></template>
      <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
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

    <EntityCrudHost :crud="crud" :config="SCENE_FORM" />
  </div>
</template>
