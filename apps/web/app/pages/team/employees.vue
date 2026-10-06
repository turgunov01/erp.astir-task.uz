<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { EMPLOYEE_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

const { t } = useI18n()

useHead({ title: computed(() => t('team.employees.title')) })

const page = ref(1)
const search = ref('')
const departmentId = ref('')

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.TEAM_MANAGE))

// Declared before the filters that read it; useEntityCrud receives it below.
const archivedView = ref(false)

const filters = computed(() => ({
  page: page.value,
  limit: 20,
  search: search.value || undefined,
  departmentId: departmentId.value || undefined,
  archived: archivedView.value ? 'true' : undefined
}))

interface EmployeeRow {
  id: string
  position: string
  employmentType: string
  hourlyRate: string | null
  weeklyCapacityHours: number
  status: string
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    role: string
    isActive: boolean
  }
  department: { id: string, name: string } | null
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<EmployeeRow>('/api/employees', filters as never)

// Department filter options come from the same API the table uses.
const { data: departmentsResponse } = await useFetch<{ data: Array<{ id: string, name: string }> }>(
  '/api/departments',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const departments = computed(() => departmentsResponse.value?.data ?? [])

const crud = useEntityCrud({
  endpoint: '/api/employees',
  refresh: () => refresh(),
  entityLabel: t('team.employees.entity'),
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns = computed<Column[]>(() => [
  { key: 'name', label: t('team.employees.columns.name'), width: '26%' },
  { key: 'position', label: t('team.employees.columns.position'), width: '20%' },
  { key: 'department', label: t('team.employees.columns.department'), width: '16%' },
  { key: 'role', label: t('team.employees.columns.role'), width: '16%' },
  { key: 'capacity', label: t('team.employees.columns.capacity'), width: '10%', numeric: true },
  { key: 'status', label: t('team.employees.columns.status'), width: '12%' },
  { key: 'actions', label: '', width: '56px' }
])

function initials(row: EmployeeRow) {
  return (row.user.firstName.charAt(0) + row.user.lastName.charAt(0)).toUpperCase()
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{{ t('team.eyebrow') }}</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('team.employees.title') }}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{{ countLabel(meta.total, 'team.employees.count') }}</p>
    </header>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" :create-label="t('team.employees.create')" :can-manage="canManage" />

    </div>


    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      :search-placeholder="t('team.employees.search')"
      empty-icon="lucide:users"
      :empty-title="t('team.employees.emptyTitle')"
      :empty-body="t('team.employees.emptyBody')"
      @update:page="page = $event"
      @update:search="page = 1"
      @retry="refresh"
    >
      <template #toolbar>
        <select
          v-model="departmentId"
          :aria-label="t('team.departmentFilter')"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          @change="page = 1"
        >
          <option value="">{{ t('team.allDepartments') }}</option>
          <option v-for="dept in departments" :key="dept.id" :value="dept.id">
            {{ dept.name }}
          </option>
        </select>
      </template>

      <template #cell-name="{ row }">
        <div class="flex items-center gap-2.5">
          <span class="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-medium">
            {{ initials(row) }}
          </span>
          <div class="min-w-0">
            <p class="truncate font-medium">{{ row.user.firstName }} {{ row.user.lastName }}</p>
            <p class="truncate text-xs text-muted-foreground">{{ row.user.email }}</p>
          </div>
        </div>
      </template>

      <template #cell-position="{ row }">{{ row.position }}</template>
      <template #cell-department="{ row }">
        {{ row.department?.name ?? '—' }}
      </template>
      <template #cell-role="{ row }">
        <span class="text-xs text-muted-foreground">{{ enumLabel(ROLE_LABEL, row.user.role) }}</span>
      </template>
      <template #cell-capacity="{ row }">{{ t('team.hours', { n: row.weeklyCapacityHours }) }}</template>
      <template #cell-status="{ row }">
        <StatusBadge :status="row.user.isActive ? row.status : 'INACTIVE'" />
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

    <EntityCrudHost
      :crud="crud"
      :config="EMPLOYEE_FORM"
      :delete-detail="t('team.employees.deleteDetail')"
    />
  </div>
</template>
