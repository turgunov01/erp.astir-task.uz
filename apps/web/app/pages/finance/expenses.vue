<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import type { TotalsField } from '~/components/finance/FinanceTotals.vue'
import { useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { useFilterOptions } from '~/composables/useFilterOptions'
import { financeCsvHref, useFinanceQuery } from '~/composables/useFinanceQuery'
import { EXPENSE_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Расходы' })

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.FINANCE_MANAGE))

const {
  filters, period, setPeriod, page, apiQuery, isFiltered, reset, searchDraft, onSearch
} = useFinanceQuery(
  ['projectId', 'clientId', 'category', 'method', 'currency', 'search'] as const,
  'all'
)

const projectOptions = useFilterOptions<{ id: string, code: string, name: string }>(
  '/api/projects',
  row => row.code + ' · ' + row.name
)
const clientOptions = useFilterOptions<{ id: string, name: string }>('/api/clients', row => row.name)

const query = computed(() => ({ ...apiQuery.value, page: page.value, limit: 20 }))

interface ExpenseRow {
  id: string
  category: string
  description: string | null
  amount: string
  currency: string
  date: string
  vendor: string | null
  paymentMethod: string | null
  documentNumber: string | null
  documentUrl: string | null
  vatAmount: string | null
  project: { id: string, code: string, client: { id: string, name: string } | null } | null
  createdBy: { firstName: string, lastName: string } | null
}

interface ExpenseTotals {
  currency: string
  amount: number
  vat: number
  count: number
}

const { items, meta, summary, pending, errorMessage, refresh } =
  useListResource<ExpenseRow, ExpenseTotals[]>('/api/finance/expenses', query as never)

const totals = computed(() => summary.value ?? [])
const totalsFields: TotalsField[] = [
  { key: 'amount', label: 'Расходы' },
  { key: 'vat', label: 'в т.ч. НДС', tone: 'muted', hideZero: true }
]

const currencyOptions = computed(() =>
  [...new Set(['USD', 'UZS', 'EUR', 'RUB', ...totals.value.map(row => row.currency)])])

const csvHref = computed(() => financeCsvHref('/api/finance/expenses', apiQuery.value))

const crud = useEntityCrud({
  endpoint: '/api/finance/expenses',
  refresh: () => refresh(),
  entityLabel: 'расход',
  // An expense has no name column, and a uuid in the delete dialog tells
  // nobody which of four render invoices they are about to remove.
  nameOf: row => describe(row as ExpenseRow)
})

function describe(row: ExpenseRow) {
  return enumLabel(EXPENSE_CATEGORY_LABEL, row.category) +
    ' · ' + formatMoney(Number(row.amount), row.currency)
}

/** Only web links become anchors; the API refuses anything else anyway. */
const safeLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null)

const SELECT = 'h-9 w-full min-w-0 rounded-md sm:w-auto sm:max-w-56 border bg-background px-2.5 text-sm outline-none focus:border-ring'

const columns: Column[] = [
  { key: 'date', label: 'Дата', width: '11%' },
  { key: 'project', label: 'Проект', width: '13%' },
  { key: 'category', label: 'Категория', width: '12%' },
  { key: 'description', label: 'Контрагент и описание', width: '24%' },
  { key: 'document', label: 'Документ', width: '13%' },
  { key: 'amount', label: 'Сумма', width: '15%', numeric: true },
  { key: 'author', label: 'Внёс', width: '12%' },
  { key: 'actions', label: '', width: '56px' }
]
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Expenses</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Расходы</h1>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">
          {{ meta.total }} записей · {{ period.label.toLowerCase() }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <a
            :href="csvHref"
            class="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-secondary"
          >
            <Icon name="lucide:download" class="size-4" />
            CSV
          </a>
          <EntityToolbar :crud="crud" create-label="Новый расход" :can-manage="canManage" />
        </div>
      </div>

      <FinancePeriodPicker class="mt-4" :period="period" allow-all @set="setPeriod" />

      <div class="mt-3 flex flex-wrap gap-2">
        <select v-model="filters.projectId" :class="SELECT" aria-label="Проект">
          <option value="">Все проекты</option>
          <option value="none">Студия — без проекта</option>
          <option v-for="option in projectOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select v-model="filters.clientId" :class="SELECT" aria-label="Клиент">
          <option value="">Все клиенты</option>
          <option v-for="option in clientOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select v-model="filters.category" :class="SELECT" aria-label="Категория">
          <option value="">Все категории</option>
          <option v-for="(label, value) in EXPENSE_CATEGORY_LABEL" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
        <select v-model="filters.method" :class="SELECT" aria-label="Способ оплаты">
          <option value="">Любой способ</option>
          <option v-for="(label, value) in PAYMENT_METHOD_LABEL" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
        <select v-model="filters.currency" :class="SELECT" aria-label="Валюта">
          <option value="">Все валюты</option>
          <option v-for="code in currencyOptions" :key="code" :value="code">{{ code }}</option>
        </select>
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
      search-placeholder="Контрагент, описание, № документа"
      empty-icon="lucide:receipt"
      :empty-title="isFiltered ? 'Под фильтр ничего не попало' : 'Пока нет расходов'"
      empty-body="Расход проекта входит в его фактическую себестоимость; расход без проекта — в накладные студии."
      @update:search="onSearch"
      @update:page="page = $event"
      @retry="refresh"
    >
      <template #cell-date="{ row }">{{ formatDay(row.date) }}</template>
      <template #cell-project="{ row }">
        <template v-if="row.project">
          <NuxtLink :to="'/projects/' + row.project.id" class="hover:underline">
            {{ row.project.code }}
          </NuxtLink>
          <span v-if="row.project.client" class="mt-0.5 block truncate text-xs text-muted-foreground">
            {{ row.project.client.name }}
          </span>
        </template>
        <span v-else class="text-muted-foreground">Студия</span>
      </template>
      <template #cell-category="{ row }">
        {{ enumLabel(EXPENSE_CATEGORY_LABEL, row.category) }}
        <span v-if="row.paymentMethod" class="mt-0.5 block text-xs text-muted-foreground">
          {{ enumLabel(PAYMENT_METHOD_LABEL, row.paymentMethod) }}
        </span>
      </template>
      <template #cell-description="{ row }">
        <span v-if="row.vendor" class="block font-medium">{{ row.vendor }}</span>
        <span v-if="row.description" class="block text-muted-foreground">{{ row.description }}</span>
        <span v-if="!row.vendor && !row.description" class="text-muted-foreground">—</span>
      </template>
      <template #cell-document="{ row }">
        <a
          v-if="safeLink(row.documentUrl)"
          :href="safeLink(row.documentUrl) ?? undefined"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 hover:underline"
        >
          {{ row.documentNumber ?? 'Скан' }}
          <Icon name="lucide:external-link" class="size-3.5 text-muted-foreground" />
        </a>
        <span v-else-if="row.documentNumber" class="tabular-nums">{{ row.documentNumber }}</span>
        <span v-else class="text-muted-foreground">—</span>
      </template>
      <template #cell-amount="{ row }">
        <span class="tabular-nums">{{ formatMoney(Number(row.amount), row.currency) }}</span>
        <span v-if="row.vatAmount !== null" class="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          НДС {{ formatMoney(Number(row.vatAmount), row.currency) }}
        </span>
      </template>
      <template #cell-author="{ row }">
        <span class="text-muted-foreground">{{ fullName(row.createdBy) }}</span>
      </template>
      <template #cell-actions="{ row }">
        <EntityRowActions
          :name="describe(row)"
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
      :config="EXPENSE_FORM"
      delete-detail="Запись исчезнет из списков и из фактической себестоимости проекта."
    />
  </div>
</template>
