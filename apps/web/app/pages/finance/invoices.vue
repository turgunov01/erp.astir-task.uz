<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { useFilterOptions } from '~/composables/useFilterOptions'
import { INVOICE_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Invoices — Aster ERP' })

const route = useRoute()
const page = ref(Number(route.query.page ?? 1))
const projectId = ref(String(route.query.projectId ?? ''))
const clientId = ref(String(route.query.clientId ?? ''))
const status = ref(String(route.query.status ?? ''))

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.FINANCE_MANAGE))

const projectOptions = useFilterOptions<{ id: string, code: string, name: string }>(
  '/api/projects',
  row => row.code + ' · ' + row.name
)
const clientOptions = useFilterOptions<{ id: string, name: string }>(
  '/api/clients',
  row => row.name
)

const filters = computed(() => ({
  page: page.value,
  limit: 20,
  projectId: projectId.value || undefined,
  clientId: clientId.value || undefined,
  status: status.value || undefined
}))

interface InvoiceRow {
  id: string
  number: string
  amount: string
  currency: string
  status: string
  issuedAt: string
  dueDate: string | null
  /** Sum of this invoice's PAID payments, computed by the API. */
  paidTotal: number
  client: { id: string, name: string } | null
  project: { id: string, code: string } | null
  _count: { payments: number }
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<InvoiceRow>('/api/finance/invoices', filters as never)

watch([projectId, clientId, status], () => { page.value = 1 })

const crud = useEntityCrud({
  endpoint: '/api/finance/invoices',
  refresh: () => refresh(),
  entityLabel: 'счёт',
  // The number is the name here: it is what the client quotes back at you.
  nameOf: row => (row as InvoiceRow).number
})

/**
 * An invoice past its due date that nobody has collected.
 *
 * Shown rather than written: the stored status stays whatever a person set, so
 * the table can flag a late invoice without silently rewriting the record.
 */
function isOverdue(row: InvoiceRow) {
  if (!row.dueDate || row.status === 'PAID' || row.status === 'CANCELLED') return false
  return new Date(row.dueDate).getTime() < Date.now()
}

function coverPercent(row: InvoiceRow) {
  const amount = Number(row.amount)
  if (amount <= 0) return 0
  return Math.min(100, Math.round((row.paidTotal / amount) * 100))
}

const columns: Column[] = [
  { key: 'number', label: 'Номер', width: '12%' },
  { key: 'client', label: 'Клиент', width: '18%' },
  { key: 'project', label: 'Проект', width: '10%' },
  { key: 'issuedAt', label: 'Выставлен', width: '12%' },
  { key: 'dueDate', label: 'Оплатить до', width: '12%' },
  { key: 'amount', label: 'Сумма', width: '13%', numeric: true },
  { key: 'paid', label: 'Оплачено', width: '13%', numeric: true },
  { key: 'status', label: 'Статус', width: '14%' },
  { key: 'actions', label: '', width: '56px' }
]
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Invoices</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Счета</h1>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">{{ meta.total }} счёт(ов)</p>
        <EntityToolbar :crud="crud" create-label="Новый счёт" :can-manage="canManage" />
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <select
          v-model="clientId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Клиент"
        >
          <option value="">Все клиенты</option>
          <option v-for="option in clientOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>

        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Проект"
        >
          <option value="">Все проекты</option>
          <option v-for="option in projectOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>

        <select
          v-model="status"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Статус"
        >
          <option value="">Любой статус</option>
          <option v-for="(label, value) in PAYMENT_STATUS_LABEL" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </div>
    </header>

    <DataTable
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      empty-icon="lucide:file-text"
      empty-title="Пока нет счетов"
      empty-body="Счёт выставляется клиенту и закрывается платежами по нему."
      @update:page="page = $event"
      @retry="refresh"
    >
      <template #cell-number="{ row }">
        <span class="font-medium tabular-nums">{{ row.number }}</span>
      </template>
      <template #cell-client="{ row }">{{ row.client?.name ?? '—' }}</template>
      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>
      <template #cell-issuedAt="{ row }">{{ formatDay(row.issuedAt) }}</template>
      <template #cell-dueDate="{ row }">
        <span :class="isOverdue(row) ? 'text-destructive' : ''">{{ formatDay(row.dueDate) }}</span>
        <span v-if="isOverdue(row)" class="mt-0.5 block text-xs text-destructive">просрочен</span>
      </template>
      <template #cell-amount="{ row }">
        <span class="tabular-nums">{{ formatMoney(Number(row.amount), row.currency) }}</span>
      </template>
      <template #cell-paid="{ row }">
        <span class="tabular-nums">{{ formatMoney(row.paidTotal, row.currency) }}</span>
        <span class="mt-0.5 block text-xs text-muted-foreground">
          {{ coverPercent(row) }}% · {{ row._count.payments }} платеж(ей)
        </span>
      </template>
      <template #cell-status="{ row }">
        <StatusBadge :status="row.status" kind="payment" />
      </template>
      <template #cell-actions="{ row }">
        <EntityRowActions
          :name="row.number"
          :archivable="false"
          :can-manage="canManage"
          :busy="crud.busyId === row.id"
          @edit="crud.openEdit(row)"
          @delete="crud.askDelete(row)"
        />
      </template>
    </DataTable>

    <EntityCrudHost
      :crud="crud"
      :config="INVOICE_FORM"
      delete-detail="Счёт исчезнет из списков. Платежи по нему останутся, но потеряют привязку."
    />
  </div>
</template>
