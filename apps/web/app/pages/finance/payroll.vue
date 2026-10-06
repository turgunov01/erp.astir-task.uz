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
useHead({ title: 'Зарплата' })

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

const monthTitle = computed(() => {
  const [year, month] = period.value.split('-').map(Number) as [number, number]
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
})

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
  entityLabel: 'запись',
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

interface Transition { to: string, label: string, icon: string }

/** Mirrors the API's allowed moves; the API is still the one that decides. */
const TRANSITIONS: Record<string, Transition[]> = {
  DRAFT: [
    { to: 'APPROVED', label: 'Утвердить', icon: 'lucide:check' },
    { to: 'CANCELLED', label: 'Отменить', icon: 'lucide:ban' }
  ],
  APPROVED: [
    { to: 'PAID', label: 'Отметить выплаченным', icon: 'lucide:banknote' },
    { to: 'DRAFT', label: 'Вернуть в черновик', icon: 'lucide:undo-2' },
    { to: 'CANCELLED', label: 'Отменить', icon: 'lucide:ban' }
  ],
  PAID: [{ to: 'APPROVED', label: 'Снять отметку о выплате', icon: 'lucide:undo-2' }],
  CANCELLED: [{ to: 'DRAFT', label: 'Восстановить как черновик', icon: 'lucide:rotate-ccw' }]
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
    actionError.value = apiErrorMessage(err, 'Не удалось изменить статус')
  } finally {
    busyId.value = ''
  }
}

const isDeletable = (row: PayrollRow) => row.status === 'DRAFT' || row.status === 'CANCELLED'

const columns = computed<Column[]>(() => [
  { key: 'date', label: 'Дата', width: '10%' },
  ...(ownOnly.value ? [] : [{ key: 'employee', label: 'Сотрудник', width: '18%' }]),
  { key: 'type', label: 'Вид', width: '16%' },
  { key: 'reason', label: 'Причина', width: ownOnly.value ? '36%' : '24%' },
  { key: 'amount', label: 'Сумма', width: '13%', numeric: true },
  { key: 'status', label: 'Статус', width: '11%' },
  ...(canManage.value ? [{ key: 'actions', label: '', width: '56px' }] : [])
])

const SELECT = 'h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring'
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Payroll</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Зарплата: авансы, штрафы, премии</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        <template v-if="ownOnly">Ваши начисления и удержания по месяцам. Черновики не показываются, пока их не утвердят.</template>
        <template v-else>Записи вносятся вручную; позже их сможет создавать система учёта посещаемости.</template>
      </p>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="grid size-9 place-items-center rounded-md border hover:bg-secondary"
            aria-label="Предыдущий месяц"
            @click="shiftMonth(-1)"
          >
            <Icon name="lucide:chevron-left" class="size-4" />
          </button>
          <input
            v-model="period"
            type="month"
            :class="SELECT"
            aria-label="Месяц расчёта"
          >
          <button
            type="button"
            class="grid size-9 place-items-center rounded-md border hover:bg-secondary"
            aria-label="Следующий месяц"
            @click="shiftMonth(1)"
          >
            <Icon name="lucide:chevron-right" class="size-4" />
          </button>
          <span class="ml-2 text-sm capitalize text-muted-foreground">{{ monthTitle }}</span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="flex rounded-md border p-0.5" role="tablist" aria-label="Вид">
            <button
              v-for="option in [{ key: 'summary', label: 'Расчёт' }, { key: 'entries', label: 'Записи' }]"
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
            Новая запись
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
        <select v-if="canViewAll" v-model="employeeId" :class="SELECT" aria-label="Сотрудник">
          <option value="">Все сотрудники</option>
          <option v-for="option in employeeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select v-model="type" :class="SELECT" aria-label="Вид записи">
          <option value="">Все виды</option>
          <option v-for="(label, value) in PAYROLL_TYPE_LABEL" :key="value" :value="value">{{ label }}</option>
        </select>
        <select v-model="status" :class="SELECT" aria-label="Статус">
          <option value="">Все статусы</option>
          <template v-for="(label, value) in PAYROLL_STATUS_LABEL" :key="value">
            <option v-if="!(ownOnly && value === 'DRAFT')" :value="value">{{ label }}</option>
          </template>
        </select>
        <span class="self-center text-sm text-muted-foreground">{{ meta.total }} записей</span>
      </div>

      <DataTable
        :columns="columns"
        :rows="items"
        :meta="meta"
        :pending="pending"
        :error-message="errorMessage"
        empty-icon="lucide:hand-coins"
        empty-title="За этот месяц записей нет"
        empty-body="Аванс, премия, штраф или удержание попадают в расчёт месяца, когда их утвердят."
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
            опоздание {{ row.lateMinutes }} мин
          </p>
          <p v-if="row.source !== 'MANUAL'" class="text-xs text-muted-foreground">
            {{ enumLabel(PAYROLL_SOURCE_LABEL, row.source) }}
          </p>
        </template>
        <template #cell-reason="{ row }">
          <span v-if="row.reason" class="line-clamp-2">{{ row.reason }}</span>
          <span v-else class="text-muted-foreground">—</span>
          <p v-if="row.period !== row.date.slice(0, 7)" class="text-xs text-muted-foreground">
            в расчёт за {{ row.period }}
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
                :aria-label="'Действия: ' + describe(row)"
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
                {{ move.label }}
              </DropdownMenuItem>
              <template v-if="row.status === 'DRAFT' || isDeletable(row)">
                <DropdownMenuSeparator />
                <DropdownMenuItem v-if="row.status === 'DRAFT'" @select="crud.openEdit(row)">
                  <Icon name="lucide:pencil" class="size-4" />
                  Редактировать
                </DropdownMenuItem>
                <DropdownMenuItem v-if="isDeletable(row)" variant="destructive" @select="crud.askDelete(row)">
                  <Icon name="lucide:trash-2" class="size-4" />
                  Удалить
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
      delete-detail="Удалить можно только черновик или отменённую запись; в расчёт месяца она не входит."
    />
  </div>
</template>
