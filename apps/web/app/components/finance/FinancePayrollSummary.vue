<script setup lang="ts">
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { shareOf, wholeHours, type PayrollMonth } from '~/utils/payroll-month'
import PayrollExplainer from '~/components/finance/PayrollExplainer.vue'

/**
 * One payroll month per employee: base salary, what was added, what was
 * withheld, and what is left to pay (client item 7).
 *
 * Rows come split by currency from the API — a salary in som and a bonus in
 * dollars are two lines, never one sum. Only approved and paid entries count;
 * drafts are shown as a count so an unsettled month does not look settled.
 */
const props = defineProps<{
  period: string
  /** Salary can be set from here. */
  canManage: boolean
  /** Caller only sees their own row; the copy speaks to them. */
  ownOnly: boolean
}>()
/** A name opens that person's month day by day («По дням»). */
const emit = defineEmits<{ openDays: [employeeId: string] }>()

interface SummaryRow {
  employee: { id: string, name: string, position: string }
  currency: string
  salary: number | null
  bonuses: number
  otherAccruals: number
  advances: number
  penalties: number
  lateness: number
  lateMinutes: number
  latenessCount: number
  deductions: number
  /** Minutes worked this month by attendance, pauses already off. */
  workedMinutes: number
  /** Salary × worked ÷ month norm, capped at the salary; null without one. */
  earned: number | null
  accrued: number
  withheld: number
  net: number
  drafts: number
}

interface Summary {
  period: string
  month: PayrollMonth
  rows: SummaryRow[]
  totals: Array<Omit<SummaryRow, 'employee' | 'salary' | 'earned'> & { salary: number, earned: number }>
}

const { t } = useI18n()

const query = computed(() => ({ period: props.period }))
const { data, pending, error, refresh } = useFetch<{ data: Summary }>(
  '/api/finance/payroll/summary',
  { query, credentials: 'include', watch: [query] }
)

const rows = computed(() => data.value?.data.rows ?? [])
const totals = computed(() => data.value?.data.totals ?? [])
const month = computed(() => data.value?.data.month ?? null)

const hours = wholeHours

/** Share of the month norm worked, for the thin bar under the hours. */
function normShare(row: SummaryRow) {
  return shareOf(row.workedMinutes, month.value?.normMinutes ?? 0)
}

defineExpose({ refresh })

/** Zero reads as a dash: a column of "0 сум" hides the numbers that matter. */
function money(value: number, currency: string) {
  return value === 0 ? '—' : formatMoney(value, currency, 0)
}

function netTone(value: number) {
  return value < 0 ? 'text-destructive' : ''
}

/* ---- salary editor ---- */

const salaryTarget = ref<SummaryRow | null>(null)
/* A type="number" input hands v-model a number, not a string. */
const salaryAmount = ref<string | number>('')
const salaryCurrency = ref('')
const salarySaving = ref(false)
const salaryError = ref('')

function editSalary(row: SummaryRow) {
  salaryTarget.value = row
  salaryAmount.value = row.salary === null ? '' : String(row.salary)
  salaryCurrency.value = row.currency
  salaryError.value = ''
}

async function saveSalary(clear = false) {
  const row = salaryTarget.value
  if (!row) return
  const raw = String(salaryAmount.value ?? '').trim()
  const amount = clear ? null : Number(raw)
  if (!clear && (raw === '' || Number.isNaN(amount) || (amount ?? 0) < 0)) {
    salaryError.value = t('finance.payroll.salary.invalid')
    return
  }
  salarySaving.value = true
  salaryError.value = ''
  try {
    await apiRequest('/api/finance/payroll/salaries/' + row.employee.id, {
      method: 'PUT',
      body: { amount, currency: salaryCurrency.value.trim() || undefined }
    })
    salaryTarget.value = null
    await refresh()
  } catch (err) {
    salaryError.value = apiErrorMessage(err, t('finance.payroll.salary.saveFailed'))
  } finally {
    salarySaving.value = false
  }
}

const TH = 'px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground'
</script>

<template>
  <section class="rounded-xl border bg-card">
    <header class="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3.5">
      <div>
        <h2 class="text-sm font-medium">
          {{ props.ownOnly ? t('finance.payroll.summary.ownTitle') : t('finance.payroll.summary.title') }}
        </h2>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ t('finance.payroll.summary.formula') }}
        </p>
      </div>
    </header>

    <PayrollExplainer v-if="month" :month="month" />

    <div v-if="error" class="px-5 py-12 text-center">
      <p class="text-sm font-medium">{{ t('finance.payroll.summary.loadFailed') }}</p>
      <button type="button" class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="refresh()">
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <div v-else-if="pending && rows.length === 0" class="divide-y">
      <div v-for="n in 4" :key="n" class="flex items-center gap-4 px-5 py-3.5">
        <div class="h-4 flex-1 rounded bg-muted" />
        <div class="h-4 w-24 rounded bg-muted" />
      </div>
    </div>

    <div v-else-if="rows.length === 0" class="px-5 py-14 text-center">
      <Icon name="lucide:hand-coins" class="size-7 text-muted-foreground" />
      <template v-if="props.ownOnly">
        <p class="mt-3 text-sm font-medium">{{ t('finance.payroll.summary.ownEmpty') }}</p>
        <p class="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {{ t('finance.payroll.summary.ownEmptyHint') }}
        </p>
      </template>
      <template v-else>
        <p class="mt-3 text-sm font-medium">{{ t('finance.payroll.summary.empty') }}</p>
        <p class="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {{ t('finance.payroll.summary.emptyHint') }}
        </p>
      </template>
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[1120px] text-sm">
        <thead>
          <tr class="border-b text-left">
            <th :class="TH">{{ t('finance.common.employee') }}</th>
            <th :class="TH" class="text-right">{{ t('finance.payroll.columns.salary') }}</th>
            <th :class="TH" class="text-right">{{ t('finance.payroll.columns.hours') }}</th>
            <th :class="TH" class="text-right">{{ t('finance.payroll.columns.earned') }}</th>
            <th :class="TH" class="text-right">{{ t('finance.payroll.columns.bonuses') }}</th>
            <th :class="TH" class="text-right">{{ t('finance.payroll.typeTotals.OTHER_ACCRUAL') }}</th>
            <th :class="TH" class="text-right">{{ t('finance.payroll.columns.penalties') }}</th>
            <th :class="TH" class="text-right">{{ t('finance.payroll.columns.lateness') }}</th>
            <th :class="TH" class="text-right">{{ t('finance.payroll.columns.deductions') }}</th>
            <th :class="TH" class="text-right">{{ t('finance.payroll.columns.advances') }}</th>
            <th :class="TH" class="text-right">{{ t('finance.payroll.columns.net') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr
            v-for="row in rows"
            :key="row.employee.id + row.currency"
            class="hover:bg-secondary/40"
          >
            <td class="px-4 py-3">
              <button
                type="button"
                class="text-left font-medium underline-offset-2 hover:underline"
                :title="t('finance.payroll.days.openFor', { name: row.employee.name })"
                @click="emit('openDays', props.ownOnly ? '' : row.employee.id)"
              >
                {{ row.employee.name }}
              </button>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ row.employee.position }}
                <span v-if="row.drafts > 0" class="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                  {{ t('finance.payroll.summary.drafts', { n: row.drafts }) }}
                </span>
              </p>
            </td>
            <td class="px-4 py-3 text-right tabular-nums">
              <button
                v-if="props.canManage"
                type="button"
                class="group inline-flex items-center gap-1.5 rounded px-1 hover:bg-secondary"
                :aria-label="t('finance.payroll.salary.editAria', { name: row.employee.name })"
                @click="editSalary(row)"
              >
                <span v-if="row.salary !== null">{{ formatMoney(row.salary, row.currency, 0) }}</span>
                <span v-else class="text-muted-foreground">{{ t('finance.payroll.salary.notSet') }}</span>
                <Icon name="lucide:pencil" class="size-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </button>
              <template v-else>
                <span v-if="row.salary !== null">{{ formatMoney(row.salary, row.currency, 0) }}</span>
                <span v-else class="text-muted-foreground">—</span>
              </template>
            </td>
            <td class="px-4 py-3 text-right tabular-nums">
              <span :class="row.workedMinutes === 0 ? 'text-muted-foreground' : ''">{{ hours(row.workedMinutes) }}</span>
              <span class="text-muted-foreground"> / {{ month ? hours(month.normMinutes) : '—' }}</span>
              <span class="mt-1 ml-auto block h-1 w-16 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                <span class="block h-full rounded-full bg-primary/70" :style="{ width: normShare(row) + '%' }" />
              </span>
            </td>
            <td class="px-4 py-3 text-right tabular-nums">
              <span v-if="row.earned !== null">{{ formatMoney(row.earned, row.currency, 0) }}</span>
              <span v-else class="text-xs text-muted-foreground">{{ t('finance.payroll.summary.noSalary') }}</span>
            </td>
            <td class="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{{ money(row.bonuses, row.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(row.otherAccruals, row.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums text-destructive">{{ money(row.penalties, row.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums text-destructive">
              {{ money(row.lateness, row.currency) }}
              <p v-if="row.latenessCount > 0" class="text-[11px] text-muted-foreground">
                {{ t('finance.payroll.summary.lateness', { count: row.latenessCount, minutes: row.lateMinutes }) }}
              </p>
            </td>
            <td class="px-4 py-3 text-right tabular-nums text-destructive">{{ money(row.deductions, row.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(row.advances, row.currency) }}</td>
            <td class="px-4 py-3 text-right font-semibold tabular-nums" :class="netTone(row.net)">
              {{ formatMoney(row.net, row.currency, 0) }}
            </td>
          </tr>
        </tbody>
        <tfoot v-if="!props.ownOnly && totals.length > 0" class="border-t-2">
          <tr v-for="total in totals" :key="total.currency" class="bg-secondary/30 font-medium">
            <td class="px-4 py-3">{{ t('finance.payroll.summary.total', { currency: total.currency }) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.salary, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ hours(total.workedMinutes) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.earned, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.bonuses, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.otherAccruals, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.penalties, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.lateness, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.deductions, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.advances, total.currency) }}</td>
            <td class="px-4 py-3 text-right font-semibold tabular-nums" :class="netTone(total.net)">
              {{ formatMoney(total.net, total.currency, 0) }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div
      v-if="salaryTarget"
      class="fixed inset-0 z-[60] grid place-items-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="salary-title"
    >
      <div class="drawer-scrim absolute inset-0 bg-black/50" @click="salaryTarget = null" />
      <form
        class="dialog-panel relative w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl"
        @submit.prevent="saveSalary()"
      >
        <h2 id="salary-title" class="text-base font-semibold tracking-tight">{{ t('finance.payroll.salary.title') }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">{{ salaryTarget.employee.name }}</p>

        <div class="mt-4 grid grid-cols-[1fr_88px] gap-3">
          <label class="text-sm">
            <span class="mb-1.5 block text-xs text-muted-foreground">{{ t('finance.common.amount') }}</span>
            <input
              v-model="salaryAmount"
              type="number"
              min="0"
              step="any"
              class="h-9 w-full rounded-md border bg-background px-2.5 text-sm tabular-nums outline-none focus:border-ring"
              autofocus
            >
          </label>
          <label class="text-sm">
            <span class="mb-1.5 block text-xs text-muted-foreground">{{ t('finance.common.currency') }}</span>
            <input
              v-model="salaryCurrency"
              maxlength="3"
              class="h-9 w-full rounded-md border bg-background px-2.5 text-sm uppercase outline-none focus:border-ring"
            >
          </label>
        </div>

        <p v-if="salaryError" role="alert" class="mt-3 text-sm text-destructive">{{ salaryError }}</p>

        <div class="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button
            v-if="salaryTarget.salary !== null"
            type="button"
            class="rounded-md px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            :disabled="salarySaving"
            @click="saveSalary(true)"
          >
            {{ t('finance.payroll.salary.clear') }}
          </button>
          <span v-else />
          <div class="flex gap-2">
            <button type="button" class="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="salaryTarget = null">
              {{ t('common.actions.cancel') }}
            </button>
            <button
              type="submit"
              class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              :disabled="salarySaving"
            >
              {{ t('common.actions.save') }}
            </button>
          </div>
        </div>
      </form>
    </div>
  </section>
</template>
