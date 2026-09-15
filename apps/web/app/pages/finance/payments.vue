<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { apiErrorMessage, apiRequest, useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { useFilterOptions } from '~/composables/useFilterOptions'
import { PAYMENT_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Payments — Aster ERP' })

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

interface PaymentRow {
  id: string
  amount: string
  currency: string
  status: string
  dueDate: string | null
  paidDate: string | null
  method: string | null
  client: { id: string, name: string } | null
  project: { id: string, code: string } | null
  invoice: { id: string, number: string } | null
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<PaymentRow>('/api/finance/payments', filters as never)

watch([projectId, clientId, status], () => { page.value = 1 })

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
  { key: 'dueDate', label: 'Срок', width: '12%' },
  { key: 'client', label: 'Клиент', width: '18%' },
  { key: 'project', label: 'Проект', width: '11%' },
  { key: 'invoice', label: 'Счёт', width: '12%' },
  { key: 'method', label: 'Способ', width: '12%' },
  { key: 'amount', label: 'Сумма', width: '14%', numeric: true },
  { key: 'status', label: 'Статус', width: '15%' },
  { key: 'actions', label: '', width: '56px' }
]
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Payments</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Платежи</h1>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">{{ meta.total }} платеж(ей)</p>
        <EntityToolbar :crud="crud" create-label="Новый платёж" :can-manage="canManage" />
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
      empty-icon="lucide:credit-card"
      empty-title="Пока нет платежей"
      empty-body="Платёж принадлежит клиенту и может закрывать выставленный ему счёт."
      @update:page="page = $event"
      @retry="refresh"
    >
      <template #cell-dueDate="{ row }">
        <span :class="isLate(row) ? 'text-destructive' : ''">{{ formatDay(row.dueDate) }}</span>
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
        <span :class="row.method ? '' : 'text-muted-foreground'">{{ row.method ?? '—' }}</span>
      </template>
      <template #cell-amount="{ row }">
        <span class="tabular-nums">{{ formatMoney(Number(row.amount), row.currency) }}</span>
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
