<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import { apiErrorMessage, apiRequest, useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { useFilterOptions } from '~/composables/useFilterOptions'
import { PAYROLL_FORM } from '~/utils/entity-forms'
import { monthInline, monthTitle as formatMonthTitle } from '~/utils/finance-period'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

/**
 * Employee pay adjustments (client item 7): advances, penalties incl.
 * lateness, bonuses and deductions, with the month they settle into.
 *
 * Two views of one month: the per-employee calculation, and the entries that
 * produce it. Somebody with only the own-entries right sees both, narrowed to
 * themselves by the API.
 */
const { t } = useI18n()

useHead({ title: computed(() => t('finance.payroll.title')) })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const canViewAll = computed(() => auth.can(PERMISSION.PAYROLL_VIEW))
const canManage = computed(() => auth.can(PERMISSION.PAYROLL_MANAGE))
const ownOnly = computed(() => !canViewAll.value)

const thisMonth = new Date().toISOString().slice(0, 7)
const isPeriod = (value: unknown) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

const period = ref(isPeriod(route.query.period) ? String(route.query.period) : thisMonth)
const tab = ref(route.query.tab === 'entries' ? 'entries' : 'summary')
const page = ref(Number(route.query.page ?? 1))
const employeeId = ref(String(route.query.employeeId ?? ''))
const type = ref(String(route.query.type ?? ''))
const status = ref(String(route.query.status ?? ''))

/* Filters live in the URL so a filtered month can be sent as a link. */
watch([period, tab, employeeId, type, status, page], () => {
  router.replace({
    query: {
      period: period.value,
      tab: tab.value === 'entries' ? 'entries' : undefined,
      employeeId: employeeId.value || undefined,
      type: type.value || undefined,
      status: status.value || undefined,
      page: page.value > 1 ? String(page.value) : undefined
    }
  })
})

/** A cleared month input falls back to the current month, not to "all time". */
watch(period, value => {
  if (!isPeriod(value)) period.value = thisMonth
})

function shiftMonth(delta: number) {
  const [year, month] = period.value.split('-').map(Number) as [number, number]
  const next = new Date(Date.UTC(year, month - 1 + delta, 1))
  period.value = next.toISOString().slice(0, 7)
}

const monthTitle = computed(() => formatMonthTitle(period.value))

/*
 * Only someone who sees everyone needs to pick a person; for the rest the
 * endpoint would answer 403, so it is not asked at all.
 */
const employeeOptions = canViewAll.value
  ? useFilterOptions<{ id: string, name: string }>('/api/finance/payroll/employees', row => row.name)
  : computed(() => [])

const filters = computed(() => ({
  page: page.value,
  limit: 20,
  period: period.value,
  employeeId: employeeId.value || undefined,
  type: type.value || undefined,
  status: status.value || undefined
}))

interface Person { id: string, firstName: string, lastName: string }

interface PayrollRow {
  id: string
  employeeId: string
  type: string
  status: string
  amount: string
  currency: string
  date: string
  period: string
  lateMinutes: number | null
  reason: string | null
  source: string
  externalId: string | null
  employee: { id: string, position: string, user: Person }
  createdBy: Person | null
  approvedBy: Person | null
  approvedAt: string | null
  paidAt: string | null
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<PayrollRow>('/api/finance/payroll', filters as never)

watch([period, employeeId, type, status], () => { page.value = 1 })

const summaryRef = ref<{ refresh: () => Promise<unknown> } | null>(null)

async function refreshAll() {
  await Promise.all([refresh(), summaryRef.value?.refresh()])
}

const crud = useEntityCrud({
  endpoint: '/api/finance/payroll',
  refresh: refreshAll,
  entityLabel: () => t('finance.payroll.entity'),
  nameOf: row => describe(row as PayrollRow)
})

function describe(row: PayrollRow) {
  return enumLabel(PAYROLL_TYPE_LABEL, row.type) + ' · ' +
    fullName(row.employee.user) + ' · ' + formatMoney(Number(row.amount), row.currency)
}

/** Amount with the sign the type gives it, so the column reads at a glance. */
function signedAmount(row: PayrollRow) {
  const sign = PAYROLL_ACCRUAL_TYPES.has(row.type) ? '+' : '−'
  return sign + ' ' + formatMoney(Number(row.amount), row.currency)
}

/* ---- status transitions ---- */

/** `action` names a message under finance.payroll.actions. */
interface Transition { to: string, action: string, icon: string }

/** Mirrors the API's allowed moves; the API is still the one that decides. */
const TRANSITIONS: Record<string, Transition[]> = {
  DRAFT: [
    { to: 'APPROVED', action: 'approve', icon: 'lucide:check' },
    { to: 'CANCELLED', action: 'cancel', icon: 'lucide:ban' }
  ],
  APPROVED: [
    { to: 'PAID', action: 'markPaid', icon: 'lucide:banknote' },
    { to: 'DRAFT', action: 'backToDraft', icon: 'lucide:undo-2' },
    { to: 'CANCELLED', action: 'cancel', icon: 'lucide:ban' }
  ],
  PAID: [{ to: 'APPROVED', action: 'unmarkPaid', icon: 'lucide:undo-2' }],
  CANCELLED: [{ to: 'DRAFT', action: 'restoreDraft', icon: 'lucide:rotate-ccw' }]
}

const busyId = ref('')
const actionError = ref('')

async function moveTo(row: PayrollRow, to: string) {
  busyId.value = row.id
  actionError.value = ''
  try {
    await apiRequest('/api/finance/payroll/' + row.id + '/status', { method: 'POST', body: { status: to } })
    await refreshAll()
  } catch (err) {
    actionError.value = apiErrorMessage(err, t('finance.payroll.statusFailed'))
  } finally {
    busyId.value = ''
  }
}

const isDeletable = (row: PayrollRow) => row.status === 'DRAFT' || row.status === 'CANCELLED'

const columns = computed<Column[]>(() => [
  { key: 'date', label: t('finance.common.date'), width: '10%' },
  ...(ownOnly.value ? [] : [{ key: 'employee', label: t('finance.common.employee'), width: '18%' }]),
  { key: 'type', label: t('finance.payroll.columns.type'), width: '16%' },
  { key: 'reason', label: t('finance.payroll.columns.reason'), width: ownOnly.value ? '36%' : '24%' },
  { key: 'amount', label: t('finance.common.amount'), width: '13%', numeric: true },
  { key: 'status', label: t('finance.common.status'), width: '11%' },
  ...(canManage.value ? [{ key: 'actions', label: '', width: '56px' }] : [])
])

const SELECT = 'h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring'
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{{ t('finance.nav.overview') }}</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('finance.nav.payroll') }}</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        <template v-if="ownOnly">{{ t('finance.payroll.introOwn') }}</template>
        <template v-else>{{ t('finance.payroll.intro') }}</template>
      </p>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="grid size-9 place-items-center rounded-md border hover:bg-secondary"
            :aria-label="t('finance.payroll.previousMonth')"
            @click="shiftMonth(-1)"
          >
            <Icon name="lucide:chevron-left" class="size-4" />
          </button>
          <input
            v-model="period"
            type="month"
            :class="SELECT"
            :aria-label="t('finance.payroll.month')"
          >
          <button
            type="button"
            class="grid size-9 place-items-center rounded-md border hover:bg-secondary"
            :aria-label="t('finance.payroll.nextMonth')"
            @click="shiftMonth(1)"
          >
            <Icon name="lucide:chevron-right" class="size-4" />
          </button>
          <span class="ml-2 text-sm text-muted-foreground">{{ monthTitle }}</span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="flex rounded-md border p-0.5" role="tablist" :aria-label="t('finance.payroll.view')">
            <button
              v-for="option in [{ key: 'summary', label: t('finance.payroll.tabs.summary') }, { key: 'entries', label: t('finance.payroll.tabs.entries') }]"
              :key="option.key"
              type="button"
              role="tab"
              class="rounded px-2.5 py-1 text-sm"
              :class="tab === option.key
                ? 'bg-secondary font-medium text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground'"
              :aria-selected="tab === option.key"
              @click="tab = option.key"
            >
              {{ option.label }}
            </button>
          </div>
          <button
            v-if="canManage"
            type="button"
            class="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            @click="crud.openCreate()"
          >
            <Icon name="lucide:plus" class="size-4" />
            {{ t('finance.payroll.create') }}
          </button>
        </div>
      </div>
    </header>

    <p
      v-if="actionError"
      role="alert"
      class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {{ actionError }}
    </p>

    <FinancePayrollSummary
      v-if="tab === 'summary'"
      ref="summaryRef"
      :period="period"
      :can-manage="canManage"
      :own-only="ownOnly"
    />

    <template v-else>
      <div class="mb-3 flex flex-wrap gap-2">
        <select v-if="canViewAll" v-model="employeeId" :class="SELECT" :aria-label="t('finance.common.employee')">
          <option value="">{{ t('finance.filters.allEmployees') }}</option>
          <option v-for="option in employeeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select v-model="type" :class="SELECT" :aria-label="t('finance.payroll.entryType')">
          <option value="">{{ t('finance.filters.allTypes') }}</option>
          <option v-for="(label, value) in PAYROLL_TYPE_LABEL" :key="value" :value="value">{{ label }}</option>
        </select>
        <select v-model="status" :class="SELECT" :aria-label="t('finance.common.status')">
          <option value="">{{ t('finance.filters.allStatuses') }}</option>
          <template v-for="(label, value) in PAYROLL_STATUS_LABEL" :key="value">
            <option v-if="!(ownOnly && value === 'DRAFT')" :value="value">{{ label }}</option>
          </template>
        </select>
        <span class="self-center text-sm text-muted-foreground">{{ t('finance.count.records', meta.total) }}</span>
      </div>

      <DataTable
        :columns="columns"
        :rows="items"
        :meta="meta"
        :pending="pending"
        :error-message="errorMessage"
        empty-icon="lucide:hand-coins"
        :empty-title="t('finance.payroll.empty')"
        :empty-body="t('finance.payroll.emptyBody')"
        @update:page="page = $event"
        @retry="refresh"
      >
        <template #cell-date="{ row }">{{ formatDay(row.date) }}</template>
        <template #cell-employee="{ row }">
          <p class="font-medium">{{ fullName(row.employee.user) }}</p>
          <p class="text-xs text-muted-foreground">{{ row.employee.position }}</p>
        </template>
        <template #cell-type="{ row }">
          {{ enumLabel(PAYROLL_TYPE_LABEL, row.type) }}
          <p v-if="row.type === 'LATENESS' && row.lateMinutes" class="text-xs text-muted-foreground">
            {{ t('finance.payroll.lateMinutes', { minutes: row.lateMinutes }) }}
          </p>
          <p v-if="row.source !== 'MANUAL'" class="text-xs text-muted-foreground">
            {{ enumLabel(PAYROLL_SOURCE_LABEL, row.source) }}
          </p>
        </template>
        <template #cell-reason="{ row }">
          <span v-if="row.reason" class="line-clamp-2">{{ row.reason }}</span>
          <span v-else class="text-muted-foreground">—</span>
          <p v-if="row.period !== row.date.slice(0, 7)" class="text-xs text-muted-foreground">
            {{ t('finance.payroll.settlesIn', { month: monthInline(row.period) }) }}
          </p>
        </template>
        <template #cell-amount="{ row }">
          <span
            class="tabular-nums"
            :class="[
              PAYROLL_ACCRUAL_TYPES.has(row.type) ? 'text-emerald-700 dark:text-emerald-400' : '',
              row.status === 'CANCELLED' ? 'line-through opacity-60' : ''
            ]"
          >
            {{ signedAmount(row) }}
          </span>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge :status="row.status" kind="payroll" />
          <p v-if="row.approvedBy && row.status !== 'DRAFT'" class="mt-0.5 text-[11px] text-muted-foreground">
            {{ fullName(row.approvedBy) }}
          </p>
        </template>
        <template #cell-actions="{ row }">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                :aria-label="t('finance.payroll.actionsAria', { entry: describe(row) })"
                :disabled="busyId === row.id"
              >
                <Icon :name="busyId === row.id ? 'lucide:loader-circle' : 'lucide:ellipsis'" class="size-4" :class="busyId === row.id ? 'animate-spin' : ''" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
              <DropdownMenuItem
                v-for="move in TRANSITIONS[row.status] ?? []"
                :key="move.to"
                @select="moveTo(row, move.to)"
              >
                <Icon :name="move.icon" class="size-4" />
                {{ t('finance.payroll.actions.' + move.action) }}
              </DropdownMenuItem>
              <template v-if="row.status === 'DRAFT' || isDeletable(row)">
                <DropdownMenuSeparator />
                <DropdownMenuItem v-if="row.status === 'DRAFT'" @select="crud.openEdit(row)">
                  <Icon name="lucide:pencil" class="size-4" />
                  {{ t('common.actions.edit') }}
                </DropdownMenuItem>
                <DropdownMenuItem v-if="isDeletable(row)" variant="destructive" @select="crud.askDelete(row)">
                  <Icon name="lucide:trash-2" class="size-4" />
                  {{ t('common.actions.delete') }}
                </DropdownMenuItem>
              </template>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>
      </DataTable>
    </template>

    <EntityCrudHost
      :crud="crud"
      :config="PAYROLL_FORM"
      :delete-detail="t('finance.payroll.deleteDetail')"
    />
  </div>
</template>
