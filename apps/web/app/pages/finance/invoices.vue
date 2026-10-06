<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { useFilterOptions } from '~/composables/useFilterOptions'
import { INVOICE_FORM } from '~/utils/entity-forms'
import type { TotalsField } from '~/components/finance/FinanceTotals.vue'
import { financeCsvHref, useFinanceQuery } from '~/composables/useFinanceQuery'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Счета' })

const {
  filters, period, setPeriod, page, apiQuery, isFiltered, reset, searchDraft, onSearch
} = useFinanceQuery(
  ['projectId', 'clientId', 'status', 'currency', 'overdue', 'search'] as const,
  'all'
)

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

const query = computed(() => ({ ...apiQuery.value, page: page.value, limit: 20 }))

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
  /** Left to collect; zero once paid or cancelled. */
  remaining: number
  /** Unpaid past its due date (or marked overdue), computed by the API. */
  overdue: boolean
  daysLate: number
  description: string | null
  vatAmount: string | null
  client: { id: string, name: string } | null
  project: { id: string, code: string } | null
  _count: { payments: number }
}

interface InvoiceTotals {
  currency: string
  amount: number
  paid: number
  outstanding: number
  overdue: number
  overdueCount: number
  count: number
}

const { items, meta, summary, pending, errorMessage, refresh } =
  useListResource<InvoiceRow, InvoiceTotals[]>('/api/finance/invoices', query as never)

const totals = computed(() => summary.value ?? [])
const totalsFields: TotalsField[] = [
  { key: 'amount', label: 'Выставлено' },
  { key: 'paid', label: 'Оплачено', tone: 'positive' },
  { key: 'outstanding', label: 'Осталось получить' },
  { key: 'overdue', label: 'Просрочено', tone: 'danger', hideZero: true }
]
const currencyOptions = computed(() =>
  [...new Set(['USD', 'UZS', 'EUR', 'RUB', ...totals.value.map(row => row.currency)])])
const csvHref = computed(() => financeCsvHref('/api/finance/invoices', apiQuery.value))
const SELECT = 'h-9 w-full min-w-0 rounded-md sm:w-auto sm:max-w-56 border bg-background px-2.5 text-sm outline-none focus:border-ring'

const crud = useEntityCrud({
  endpoint: '/api/finance/invoices',
  refresh: () => refresh(),
  entityLabel: 'счёт',
  // The number is the name here: it is what the client quotes back at you.
  nameOf: row => (row as InvoiceRow).number
})

function coverPercent(row: InvoiceRow) {
  const amount = Number(row.amount)
  if (amount <= 0) return 0
  return Math.min(100, Math.round((row.paidTotal / amount) * 100))
}

const columns: Column[] = [
  { key: 'number', label: 'Счёт', width: '19%' },
  { key: 'client', label: 'Клиент', width: '15%' },
  { key: 'dueDate', label: 'Оплатить до', width: '12%' },
  { key: 'amount', label: 'Сумма', width: '15%', numeric: true },
  { key: 'paid', label: 'Оплачено', width: '14%', numeric: true },
  { key: 'remaining', label: 'Остаток', width: '13%', numeric: true },
  { key: 'status', label: 'Статус', width: '12%' },
  { key: 'actions', label: '', width: '56px' }
]
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Финансы</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Счета</h1>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">
          {{ meta.total }} счёт(ов) · {{ period.label.toLowerCase() }}, по дате выставления
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <a
            :href="csvHref"
            class="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-secondary"
          >
            <Icon name="lucide:download" class="size-4" />
            CSV
          </a>
          <EntityToolbar :crud="crud" create-label="Новый счёт" :can-manage="canManage" />
        </div>
      </div>

      <FinancePeriodPicker class="mt-4" :period="period" allow-all @set="setPeriod" />

      <div class="mt-3 flex flex-wrap gap-2">
        <select v-model="filters.clientId" :class="SELECT" aria-label="Клиент">
          <option value="">Все клиенты</option>
          <option v-for="option in clientOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select v-model="filters.projectId" :class="SELECT" aria-label="Проект">
          <option value="">Все проекты</option>
          <option value="none">Без проекта</option>
          <option v-for="option in projectOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select v-model="filters.status" :class="SELECT" aria-label="Статус">
          <option value="">Любой статус</option>
          <option v-for="(label, value) in PAYMENT_STATUS_LABEL" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
        <select v-model="filters.currency" :class="SELECT" aria-label="Валюта">
          <option value="">Все валюты</option>
          <option v-for="code in currencyOptions" :key="code" :value="code">{{ code }}</option>
        </select>
        <label class="inline-flex h-9 items-center gap-2 rounded-md border px-2.5 text-sm">
          <input
            type="checkbox"
            :checked="filters.overdue === 'true'"
            class="size-4 accent-current"
            @change="filters.overdue = ($event.target as HTMLInputElement).checked ? 'true' : ''"
          >
          Только просроченные
        </label>
        <button
          v-if="isFiltered"
          type="button"
          class="h-9 rounded-md px-2.5 text-sm text-muted-foreground hover:text-foreground"
          @click="reset()"
        >
          Сбросить
        </button>
      </div>
    </header>

    <DataTable
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      :search="searchDraft"
      search-placeholder="Номер, клиент, назначение"
      empty-icon="lucide:file-text"
      :empty-title="isFiltered ? 'Под фильтр ничего не попало' : 'Пока нет счетов'"
      empty-body="Счёт выставляется клиенту и закрывается платежами по нему."
      @update:search="onSearch"
      @update:page="page = $event"
      @retry="refresh"
    >
      <template #cell-number="{ row }">
        <span class="font-medium tabular-nums">{{ row.number }}</span>
        <span class="block text-xs text-muted-foreground">от {{ formatDay(row.issuedAt) }}</span>
        <span v-if="row.description" class="mt-0.5 block truncate text-xs text-muted-foreground" :title="row.description">
          {{ row.description }}
        </span>
      </template>
      <template #cell-client="{ row }">
        {{ row.client?.name ?? '—' }}
        <NuxtLink
          v-if="row.project"
          :to="'/projects/' + row.project.id"
          class="mt-0.5 block text-xs text-muted-foreground hover:underline"
        >
          {{ row.project.code }}
        </NuxtLink>
      </template>
      <template #cell-dueDate="{ row }">
        <span :class="row.overdue ? 'text-destructive' : ''">{{ formatDay(row.dueDate) }}</span>
        <span v-if="row.overdue" class="mt-0.5 block text-xs text-destructive">
          {{ row.daysLate > 0 ? 'просрочен на ' + row.daysLate + ' дн.' : 'просрочен' }}
        </span>
      </template>
      <template #cell-amount="{ row }">
        <span class="tabular-nums">{{ formatMoney(Number(row.amount), row.currency) }}</span>
        <span v-if="row.vatAmount !== null" class="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          НДС {{ formatMoney(Number(row.vatAmount), row.currency) }}
        </span>
      </template>
      <template #cell-paid="{ row }">
        <span class="tabular-nums">{{ formatMoney(row.paidTotal, row.currency) }}</span>
        <span class="mt-0.5 block text-xs text-muted-foreground">
          {{ coverPercent(row) }}% · {{ row._count.payments }} платеж(ей)
        </span>
      </template>
      <template #cell-remaining="{ row }">
        <span
          class="tabular-nums"
          :class="row.remaining === 0 ? 'text-muted-foreground' : row.overdue ? 'font-medium text-destructive' : 'font-medium'"
        >
          {{ row.remaining === 0 ? '—' : formatMoney(row.remaining, row.currency) }}
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

    <FinanceTotals :rows="totals" :fields="totalsFields" :pending="pending" />

    <EntityCrudHost
      :crud="crud"
      :config="INVOICE_FORM"
      delete-detail="Счёт исчезнет из списков. Платежи по нему останутся, но потеряют привязку."
    />
  </div>
</template>
