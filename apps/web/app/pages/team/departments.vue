<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { DEPARTMENT_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Departments — Aster ERP' })

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
  entityLabel: 'отдел',
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns: Column[] = [
  { key: 'name', label: 'Department', width: '34%' },
  { key: 'description', label: 'Description', width: '46%' },
  { key: 'employees', label: 'Employees', width: '20%', numeric: true },
  { key: 'actions', label: '', width: '56px' }
]
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Team</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Отделы</h1>
      <p class="mt-1 text-sm text-muted-foreground">{{ meta.total }} отдел(ов)</p>
    </header>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" create-label="Новый отдел" :can-manage="canManage" />

    </div>


    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      search-placeholder="Поиск отдела..."
      empty-icon="lucide:building-2"
      empty-title="Нет отделов"
      empty-body="Отделы группируют сотрудников по специализации."
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
