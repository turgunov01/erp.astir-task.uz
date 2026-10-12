<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { DEPARTMENT_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

/**
 * The department list with its create, edit, archive and delete actions.
 *
 * One component for both places a studio manages departments — the team
 * section and the Settings page — so the two can never drift apart.
 */
const { t } = useI18n()

const page = ref(1)
const search = ref('')
const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.TEAM_MANAGE))

// Declared before the filters that read it; useEntityCrud receives it below.
const archivedView = ref(false)

const filters = computed(() => ({
  page: page.value,
  limit: 20,
  search: search.value || undefined,
  archived: archivedView.value ? 'true' : undefined
}))

interface DepartmentRow {
  id: string
  name: string
  description: string | null
  _count: { employees: number }
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<DepartmentRow>('/api/departments', filters as never)

const crud = useEntityCrud({
  endpoint: '/api/departments',
  refresh: () => refresh(),
  entityLabel: () => t('team.departments.entity'),
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns = computed<Column[]>(() => [
  { key: 'name', label: t('team.departments.columns.name'), width: '34%' },
  { key: 'description', label: t('team.departments.columns.description'), width: '46%' },
  { key: 'employees', label: t('team.departments.columns.employees'), width: '20%', numeric: true },
  { key: 'actions', label: '', width: '56px' }
])
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted-foreground">{{ countLabel(meta.total, 'team.departments.count') }}</p>
      <EntityToolbar :crud="crud" :create-label="t('team.departments.create')" :can-manage="canManage" />
    </div>

    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      :search-placeholder="t('team.departments.search')"
      empty-icon="lucide:building-2"
      :empty-title="t('team.departments.emptyTitle')"
      :empty-body="t('team.departments.emptyBody')"
      @update:page="page = $event"
      @update:search="page = 1"
      @retry="refresh"
    >
      <template #cell-name="{ row }">
        <span class="font-medium">{{ row.name }}</span>
      </template>
      <template #cell-description="{ row }">
        <span :class="row.description ? '' : 'text-muted-foreground'">
          {{ row.description || '—' }}
        </span>
      </template>
      <template #cell-employees="{ row }">{{ row._count.employees }}</template>
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

    <EntityCrudHost :crud="crud" :config="DEPARTMENT_FORM" />
  </div>
</template>
