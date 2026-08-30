<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { PERMISSION, ASSET_TYPE, PRODUCTION_STATUS } from '@astir/types'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { ASSET_FORM } from '~/utils/entity-forms'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Библиотека ассетов — Aster ERP' })

const route = useRoute()
const { openEntity } = useTaskPanels()
const page = ref(Number(route.query.page ?? 1))
const search = ref(String(route.query.search ?? ''))
const type = ref(String(route.query.type ?? ''))
const projectId = ref('')

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.ASSET_MANAGE))

// Declared before the filters that read it; useEntityCrud receives it below.
const archivedView = ref(false)

const filters = computed(() => ({
  page: page.value,
  // Ten rows a page: the server sends exactly this many, not a trimmed list.
  limit: 10,
  search: search.value || undefined,
  type: type.value || undefined,
  projectId: projectId.value || undefined,
  archived: archivedView.value ? 'true' : undefined
}))

interface AssetRow {
  id: string
  name: string
  type: string
  status: string
  thumbnailUrl: string | null
  project: { id: string, code: string } | null
  owner: { firstName: string, lastName: string } | null
  _count: { versions: number }
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<AssetRow>('/api/assets', filters as never)

const { data: projectData } = await useFetch<{ data: Array<{ id: string, code: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const projects = computed(() => projectData.value?.data ?? [])

const TYPES = Object.values(ASSET_TYPE)
const STATUSES = Object.values(PRODUCTION_STATUS)

const crud = useEntityCrud({
  endpoint: '/api/assets',
  refresh: () => refresh(),
  entityLabel: 'ассет',
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns: Column[] = [
  { key: 'name', label: 'Ассет', width: '34%' },
  { key: 'type', label: 'Тип', width: '16%' },
  { key: 'project', label: 'Проект', width: '14%' },
  { key: 'owner', label: 'Владелец', width: '18%' },
  { key: 'versions', label: 'Версий', width: '8%', numeric: true },
  { key: 'status', label: 'Статус', width: '10%' },
  { key: 'actions', label: '', width: '56px' }
]
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Production
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Библиотека ассетов</h1>
      <p class="mt-1 text-sm text-muted-foreground">{{ meta.total }} ассет(ов)</p>
    </header>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" create-label="Новый ассет" :can-manage="canManage" />

    </div>


    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      row-clickable
      search-placeholder="Поиск по названию..."
      empty-icon="lucide:box"
      empty-title="Библиотека пуста"
      empty-body="Персонажи, окружения, пропсы и риги будут здесь."
      @update:page="page = $event"
      @update:search="page = 1"
      @retry="refresh"
      @row-click="openEntity('asset', $event.id)"
    >
      <template #toolbar>
        <select
          v-model="type"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по типу"
          @change="page = 1"
        >
          <option value="">Все типы</option>
          <option v-for="t in TYPES" :key="t" :value="t">{{ ASSET_TYPE_LABEL[t] ?? t }}</option>
        </select>
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по проекту"
          @change="page = 1"
        >
          <option value="">Все проекты</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.code }}</option>
        </select>
      </template>

      <template #cell-name="{ row }">
        <div class="flex items-center gap-2.5">
          <span class="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary">
            <img
              v-if="row.thumbnailUrl"
              :src="row.thumbnailUrl"
              :alt="row.name"
              class="size-full object-cover"
            >
            <Icon v-else name="lucide:box" class="size-4 text-muted-foreground" />
          </span>
          <span class="min-w-0 truncate font-medium">{{ row.name }}</span>
        </div>
      </template>

      <template #cell-type="{ row }">
        <span class="text-xs text-muted-foreground">{{ ASSET_TYPE_LABEL[row.type] ?? row.type }}</span>
      </template>

      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">общий</span>
      </template>

      <template #cell-owner="{ row }">
        <span v-if="row.owner">{{ row.owner.firstName }} {{ row.owner.lastName }}</span>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-versions="{ row }">{{ row._count.versions }}</template>
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

    <EntityCrudHost :crud="crud" :config="ASSET_FORM" />
  </div>
</template>
