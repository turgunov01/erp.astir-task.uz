<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { CLIENT_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Clients — Aster ERP' })

const route = useRoute()
const page = ref(Number(route.query.page ?? 1))
const search = ref(String(route.query.search ?? ''))

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.CLIENT_MANAGE))

// Declared before the filters that read it; useEntityCrud receives it below.
const archivedView = ref(false)

const filters = computed(() => ({
  page: page.value,
  limit: 20,
  search: search.value || undefined,
  archived: archivedView.value ? 'true' : undefined
}))

interface ClientRow {
  id: string
  name: string
  companyName: string | null
  email: string | null
  country: string | null
  status: string
  _count: { projects: number, contacts: number }
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<ClientRow>('/api/clients', filters as never)

const crud = useEntityCrud({
  endpoint: '/api/clients',
  refresh: () => refresh(),
  entityLabel: 'клиента',
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns: Column[] = [
  { key: 'name', label: 'Client', width: '28%' },
  { key: 'email', label: 'Email', width: '24%' },
  { key: 'country', label: 'Country', width: '16%' },
  { key: 'projects', label: 'Projects', width: '12%', numeric: true },
  { key: 'status', label: 'Status', width: '14%' },
  { key: 'actions', label: '', width: '56px' }
]
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Clients</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Клиенты</h1>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">{{ meta.total }} клиент(ов)</p>
        <EntityToolbar :crud="crud" create-label="Новый клиент" :can-manage="canManage" />
      </div>
    </header>

    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      search-placeholder="Поиск по имени, компании, email..."
      empty-icon="lucide:handshake"
      empty-title="Пока нет клиентов"
      empty-body="Клиент — владелец проектов и получатель поставки."
      @update:page="page = $event"
      @update:search="page = 1"
      @retry="refresh"
    >
      <template #cell-name="{ row }">
        <p class="font-medium">{{ row.name }}</p>
        <p v-if="row.companyName" class="mt-0.5 text-xs text-muted-foreground">
          {{ row.companyName }}
        </p>
      </template>
      <template #cell-email="{ row }">
        <a v-if="row.email" :href="'mailto:' + row.email" class="hover:underline">{{ row.email }}</a>
        <span v-else class="text-muted-foreground">—</span>
      </template>
      <template #cell-projects="{ row }">{{ row._count.projects }}</template>
      <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
      <template #cell-actions="{ row }">
        <EntityRowActions
          :name="row.name"
          :archived="crud.archivedView"
          :can-manage="canManage"
          :busy="crud.busyId === row.id"
          @edit="crud.openEdit(row)"
          @archive="crud.archive(row)"
          @unarchive="crud.unarchive(row)"
          @delete="crud.askDelete(row)"
        />
      </template>
    </DataTable>

    <EntityCrudHost :crud="crud" :config="CLIENT_FORM" />
  </div>
</template>
