<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { PERMISSION, ASSET_TYPE, PRODUCTION_STATUS } from '@astir/types'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { ASSET_FORM } from '~/utils/entity-forms'
import { useAuthStore } from '~/stores/auth'

const { t } = useI18n()

useHead({ title: computed(() => t('shell.nav.assets')) })

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
  entityLabel: () => t('production.assets.deleteEntity'),
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns = computed<Column[]>(() => [
  { key: 'name', label: t('production.assets.columns.name'), width: '34%' },
  { key: 'type', label: t('production.assets.columns.type'), width: '16%' },
  { key: 'project', label: t('production.assets.columns.project'), width: '14%' },
  { key: 'owner', label: t('production.assets.columns.owner'), width: '18%' },
  { key: 'versions', label: t('production.assets.columns.versions'), width: '8%', numeric: true },
  { key: 'status', label: t('production.assets.columns.status'), width: '10%' },
  { key: 'actions', label: '', width: '56px' }
])
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {{ t('shell.nav.production') }}
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('shell.nav.assets') }}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{{ countLabel(meta.total, 'production.assets.count') }}</p>
    </header>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" :create-label="t('production.assets.createLabel')" :can-manage="canManage" />

    </div>


    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      row-clickable
      :search-placeholder="t('production.assets.searchPlaceholder')"
      empty-icon="lucide:box"
      :empty-title="t('production.assets.emptyTitle')"
      :empty-body="t('production.assets.emptyBody')"
      @update:page="page = $event"
      @update:search="page = 1"
      @retry="refresh"
      @row-click="openEntity('asset', $event.id)"
    >
      <template #toolbar>
        <select
          v-model="type"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          :aria-label="t('production.assets.filters.typeAria')"
          @change="page = 1"
        >
          <option value="">{{ t('production.assets.filters.allTypes') }}</option>
          <option v-for="typeValue in TYPES" :key="typeValue" :value="typeValue">{{ labelOf(ASSET_TYPE_LABEL, typeValue) }}</option>
        </select>
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          :aria-label="t('production.assets.filters.projectAria')"
          @change="page = 1"
        >
          <option value="">{{ t('production.assets.filters.allProjects') }}</option>
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
        <span class="text-xs text-muted-foreground">{{ labelOf(ASSET_TYPE_LABEL, row.type) }}</span>
      </template>

      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">{{ t('production.detail.shared') }}</span>
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
