<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { apiErrorMessage, apiRequest, useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { useFilterOptions } from '~/composables/useFilterOptions'
import { PAYMENT_FORM } from '~/utils/entity-forms'
import type { TotalsField } from '~/components/finance/FinanceTotals.vue'
import { financeCsvHref, useFinanceQuery } from '~/composables/useFinanceQuery'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Платежи' })

const {
  filters, period, setPeriod, page, apiQuery, isFiltered, reset, searchDraft, onSearch
} = useFinanceQuery(
  ['projectId', 'clientId', 'status', 'method', 'currency', 'overdue', 'search'] as const,
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

interface PaymentRow {
  id: string
  amount: string
  currency: string
  status: string
  dueDate: string | null
  paidDate: string | null
  method: string | null
  reference: string | null
  fee: string
  notes: string | null
  client: { id: string, name: string } | null
  project: { id: string, code: string } | null
  invoice: { id: string, number: string } | null
}

interface PaymentTotals {
  currency: string
  amount: number
  paid: number
  expected: number
  fee: number
  count: number
}

const { items, meta, summary, pending, errorMessage, refresh } =
  useListResource<PaymentRow, PaymentTotals[]>('/api/finance/payments', query as never)

const totals = computed(() => summary.value ?? [])
const totalsFields: TotalsField[] = [
  { key: 'paid', label: 'Получено', tone: 'positive' },
  { key: 'expected', label: 'Ожидается' },
  { key: 'fee', label: 'Комиссии', tone: 'muted', hideZero: true }
]
const currencyOptions = computed(() =>
  [...new Set(['USD', 'UZS', 'EUR', 'RUB', ...totals.value.map(row => row.currency)])])
const csvHref = computed(() => financeCsvHref('/api/finance/payments', apiQuery.value))
const SELECT = 'h-9 w-full min-w-0 rounded-md sm:w-auto sm:max-w-56 border bg-background px-2.5 text-sm outline-none focus:border-ring'

/* ------------------------------------------------- closing a covered invoice */

interface Coverage {
  id: string
  number: string
  currency: string
  status: string
  amount: number
  paidTotal: number
  covered: boolean
}

/**
 * The invoice a just-saved payment finished paying off, if there is one.
 *
 * Recording a payment never touches the invoice by itself. Once its payments
 * cover it the user is asked, so an invoice is only ever closed by somebody who
 * saw it happen — and a partial payment closes nothing.
 */
const coverage = ref<Coverage | null>(null)
const closing = ref(false)
const closeError = ref('')

async function afterSave(saved: unknown) {
  const payment = (saved as { data?: { invoiceId?: string | null, status?: string } })?.data
  if (!payment?.invoiceId || payment.status !== 'PAID') return
  try {
    const res = await apiRequest<{ data: Coverage }>(
      '/api/finance/invoices/' + payment.invoiceId + '/coverage'
    )
    if (res.data.covered && res.data.status !== 'PAID') coverage.value = res.data
  } catch {
    // The payment is saved either way, and a failed follow-up question does not
    // deserve an error banner over a record that went in fine.
  }
}

async function closeInvoice() {
  const invoice = coverage.value
  if (!invoice) return
  closing.value = true
  closeError.value = ''
  try {
    await apiRequest('/api/finance/invoices/' + invoice.id, {
      method: 'PATCH',
      body: { status: 'PAID' }
    })
    coverage.value = null
    await refresh()
  } catch (err) {
    closeError.value = apiErrorMessage(err, 'Не удалось отметить счёт оплаченным')
    coverage.value = null
  } finally {
    closing.value = false
  }
}

const coverageMessage = computed(() => {
  const invoice = coverage.value
  if (!invoice) return ''
  return 'Счёт ' + invoice.number + ' на ' +
    formatMoney(invoice.amount, invoice.currency) +
    ' полностью покрыт платежами. Отметить его оплаченным?'
})

/* ------------------------------------------------------------------- table */

const crud = useEntityCrud({
  endpoint: '/api/finance/payments',
  refresh: () => refresh(),
  entityLabel: 'платёж',
  nameOf: row => describe(row as PaymentRow),
  onSaved: afterSave
})

function describe(row: PaymentRow) {
  return formatMoney(Number(row.amount), row.currency) +
    ' · ' + (row.client?.name ?? 'без клиента')
}

/** An unpaid row past its due date is what this page gets scanned for. */
function isLate(row: PaymentRow) {
  if (!row.dueDate || row.status === 'PAID' || row.status === 'CANCELLED') return false
  return new Date(row.dueDate).getTime() < Date.now()
}

const columns: Column[] = [
  { key: 'dueDate', label: 'Оплата / срок', width: '13%' },
  { key: 'client', label: 'Клиент', width: '18%' },
  { key: 'project', label: 'Проект', width: '10%' },
  { key: 'invoice', label: 'Счёт', width: '11%' },
  { key: 'method', label: 'Способ и № операции', width: '15%' },
  { key: 'amount', label: 'Сумма', width: '15%', numeric: true },
  { key: 'status', label: 'Статус', width: '12%' },
  { key: 'actions', label: '', width: '56px' }
]
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Финансы</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Платежи</h1>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">
          {{ meta.total }} платеж(ей) · {{ period.label.toLowerCase() }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <a
            :href="csvHref"
            class="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-secondary"
          >
            <Icon name="lucide:download" class="size-4" />
            CSV
          </a>
          <EntityToolbar :crud="crud" create-label="Новый платёж" :can-manage="canManage" />
        </div>
      </div>

      <FinancePeriodPicker class="mt-4" :period="period" allow-all @set="setPeriod" />
      <p class="mt-1.5 text-xs text-muted-foreground">
        Оплаченный платёж относится к дню оплаты, ожидаемый — к своему сроку.
      </p>

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
        <select v-model="filters.method" :class="SELECT" aria-label="Способ">
          <option value="">Любой способ</option>
          <option v-for="(label, value) in PAYMENT_METHOD_LABEL" :key="value" :value="value">
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

    <p
      v-if="closeError"
      role="alert"
      class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {{ closeError }}
    </p>

    <DataTable
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      :search="searchDraft"
      search-placeholder="№ операции, клиент, счёт"
      empty-icon="lucide:credit-card"
      :empty-title="isFiltered ? 'Под фильтр ничего не попало' : 'Пока нет платежей'"
      empty-body="Платёж принадлежит клиенту и может закрывать выставленный ему счёт."
      @update:search="onSearch"
      @update:page="page = $event"
      @retry="refresh"
    >
      <template #cell-dueDate="{ row }">
        <template v-if="row.paidDate">
          <span>{{ formatDay(row.paidDate) }}</span>
          <span v-if="row.dueDate" class="mt-0.5 block text-xs text-muted-foreground">срок {{ formatDay(row.dueDate) }}</span>
        </template>
        <template v-else>
          <span :class="isLate(row) ? 'text-destructive' : ''">{{ formatDay(row.dueDate) }}</span>
          <span v-if="isLate(row)" class="mt-0.5 block text-xs text-destructive">просрочен</span>
        </template>
      </template>
      <template #cell-client="{ row }">{{ row.client?.name ?? '—' }}</template>
      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>
      <template #cell-invoice="{ row }">
        <span v-if="row.invoice" class="tabular-nums">{{ row.invoice.number }}</span>
        <span v-else class="text-muted-foreground">—</span>
      </template>
      <template #cell-method="{ row }">
        <span v-if="row.method">{{ enumLabel(PAYMENT_METHOD_LABEL, row.method) }}</span>
        <span v-else class="text-muted-foreground">—</span>
        <span v-if="row.reference" class="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">
          {{ row.reference }}
        </span>
      </template>
      <template #cell-amount="{ row }">
        <span class="tabular-nums">{{ formatMoney(Number(row.amount), row.currency) }}</span>
        <span v-if="Number(row.fee) > 0" class="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          комиссия {{ formatMoney(Number(row.fee), row.currency) }}
        </span>
        <span v-if="row.notes" class="mt-0.5 block truncate text-xs text-muted-foreground" :title="row.notes">
          {{ row.notes }}
        </span>
      </template>
      <template #cell-status="{ row }">
        <StatusBadge :status="row.status" kind="payment" />
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
      :config="PAYMENT_FORM"
      delete-detail="Платёж исчезнет из списков и перестанет засчитываться в оплату счёта."
    />

    <ConfirmDialog
      v-if="coverage"
      title="Счёт покрыт"
      :message="coverageMessage"
      detail="Статус счёта меняется только этим подтверждением — сам платёж его не трогает."
      confirm-label="Отметить оплаченным"
      cancel-label="Оставить как есть"
      tone="neutral"
      :pending="closing"
      @confirm="closeInvoice"
      @cancel="coverage = null"
    />
  </div>
</template>
