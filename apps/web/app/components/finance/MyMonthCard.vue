<script setup lang="ts">
import { shareOf, wholeHours, type PayrollMonth } from '~/utils/payroll-month'

/**
 * «Мой месяц» — the employee's own month at a glance: how many hours the
 * schedule asks for, how many are worked, and what that has earned so far,
 * with lateness fines and the amount to be paid.
 *
 * Reads /api/finance/payroll/me, which always answers with the caller's own
 * row, so the owner and administrators see their own month here too.
 */
const props = withDefaults(defineProps<{ period?: string }>(), { period: '' })

const { t } = useI18n()

interface OwnRow {
  currency: string
  salary: number | null
  workedMinutes: number
  earned: number | null
  bonuses: number
  otherAccruals: number
  lateness: number
  latenessCount: number
  lateMinutes: number
  penalties: number
  deductions: number
  advances: number
  net: number
}

type OwnMonth =
  | { tracked: false }
  | { tracked: true, period: string, month: PayrollMonth, rows: OwnRow[] }

const BEHIND_THRESHOLD_MINUTES = 30

const query = computed(() => (props.period ? { period: props.period } : {}))
const { data, pending, error, refresh } = useFetch<{ data: OwnMonth }>(
  '/api/finance/payroll/me',
  { query, credentials: 'include', watch: [query] }
)

defineExpose({ refresh })

const own = computed(() => {
  const answer = data.value?.data
  return answer && answer.tracked ? answer : null
})
const month = computed(() => own.value?.month ?? null)
/** The row with the hours (the salary's currency); fines in another currency stay apart. */
const main = computed(() => {
  const rows = own.value?.rows ?? []
  return rows.find(row => row.salary !== null) ?? rows.find(row => row.workedMinutes > 0) ?? rows[0] ?? null
})
const others = computed(() => (own.value?.rows ?? []).filter(row => row !== main.value))

const worked = computed(() => main.value?.workedMinutes ?? 0)
const workedShare = computed(() => shareOf(worked.value, month.value?.normMinutes ?? 0))
const dueShare = computed(() => shareOf(month.value?.normToDateMinutes ?? 0, month.value?.normMinutes ?? 0))
/** Minutes behind the norm that has come due so far (negative: ahead of it). */
const behind = computed(() => (month.value?.normToDateMinutes ?? 0) - worked.value)

const otherWithheld = (row: OwnRow) => row.penalties + row.deductions + row.advances
const money = (value: number, currency: string) => formatMoney(value, currency, 0)
</script>

<template>
  <section v-if="pending && !data" class="rounded-xl border bg-card p-5" aria-busy="true">
    <div class="h-4 w-32 rounded bg-muted" />
    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      <div v-for="n in 3" :key="n" class="h-16 rounded-lg bg-muted" />
    </div>
  </section>

  <section v-else-if="error" class="rounded-xl border bg-card px-5 py-4 text-sm">
    <span class="text-muted-foreground">{{ t('finance.payroll.myMonth.loadFailed') }}</span>
    <button type="button" class="ml-2 underline underline-offset-2" @click="refresh()">{{ t('common.actions.retry') }}</button>
  </section>

  <section v-else-if="own && month && main" class="overflow-hidden rounded-xl border bg-card" aria-labelledby="my-month-title">
    <header class="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3.5">
      <h2 id="my-month-title" class="text-sm font-medium">{{ t('finance.payroll.myMonth.title') }}</h2>
      <span class="text-xs text-muted-foreground">
        {{ t('finance.payroll.myMonth.schedule', { days: month.workingDays, start: month.start, end: month.end }) }}
      </span>
    </header>

    <div class="grid gap-px bg-border sm:grid-cols-[1.4fr_1fr_1fr]">
      <!-- Hours: the month norm, what is worked, and where today's due line sits. -->
      <div class="bg-card p-5">
        <p class="text-xs text-muted-foreground">{{ t('finance.payroll.myMonth.hours') }}</p>
        <p class="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
          {{ wholeHours(worked) }}
          <span class="text-lg font-normal text-muted-foreground">/ {{ wholeHours(month.normMinutes) }} {{ t('finance.payroll.myMonth.hoursUnit') }}</span>
        </p>
        <div
          class="relative mt-3 h-2 rounded-full bg-secondary"
          role="progressbar"
          :aria-valuenow="workedShare"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t('finance.payroll.myMonth.hours')"
        >
          <div class="h-full rounded-full bg-primary transition-[width] duration-500" :style="{ width: workedShare + '%' }" />
          <span
            v-if="dueShare > 0 && dueShare < 100"
            class="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60"
            :style="{ left: dueShare + '%' }"
            :title="t('finance.payroll.myMonth.dueMarker')"
          />
        </div>
        <p class="mt-2 text-xs" :class="behind > BEHIND_THRESHOLD_MINUTES ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'">
          <template v-if="behind > BEHIND_THRESHOLD_MINUTES">{{ t('finance.payroll.myMonth.behind', { hours: formatMinutes(behind) }) }}</template>
          <template v-else>{{ t('finance.payroll.myMonth.onTrack', { hours: wholeHours(month.normToDateMinutes) }) }}</template>
        </p>
      </div>

      <!-- Earned: the salary share the hours have earned so far. -->
      <div class="bg-card p-5">
        <p class="text-xs text-muted-foreground">{{ t('finance.payroll.myMonth.earned') }}</p>
        <template v-if="main.earned !== null && main.salary !== null">
          <p class="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{{ money(main.earned, main.currency) }}</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ t('finance.payroll.myMonth.ofSalary', { salary: money(main.salary, main.currency) }) }}
          </p>
        </template>
        <p v-else class="mt-1 text-sm text-muted-foreground">{{ t('finance.payroll.myMonth.noSalary') }}</p>
        <p v-if="main.bonuses + main.otherAccruals > 0" class="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
          + {{ money(main.bonuses + main.otherAccruals, main.currency) }} {{ t('finance.payroll.myMonth.bonuses') }}
        </p>
      </div>

      <!-- To be paid, after fines and advances. -->
      <div class="bg-card p-5">
        <p class="text-xs text-muted-foreground">{{ t('finance.payroll.columns.net') }}</p>
        <p class="mt-1 text-2xl font-semibold tracking-tight tabular-nums" :class="main.net < 0 ? 'text-destructive' : ''">
          {{ money(main.net, main.currency) }}
        </p>
        <p v-if="main.latenessCount > 0" class="mt-1 text-xs" :class="main.lateness > 0 ? 'text-destructive' : 'text-amber-700 dark:text-amber-300'">
          <template v-if="main.lateness > 0">
            {{ t('finance.payroll.myMonth.lateness', { count: main.latenessCount, minutes: main.lateMinutes, amount: money(main.lateness, main.currency) }) }}
          </template>
          <template v-else>
            {{ t('finance.payroll.myMonth.latenessNoFine', { count: main.latenessCount, minutes: main.lateMinutes }) }}
          </template>
        </p>
        <p v-if="otherWithheld(main) > 0" class="mt-1 text-xs text-muted-foreground">
          − {{ money(otherWithheld(main), main.currency) }} {{ t('finance.payroll.myMonth.otherWithheld') }}
        </p>
        <p v-for="row in others" :key="row.currency" class="mt-1 text-xs text-muted-foreground">
          {{ t('finance.payroll.myMonth.otherCurrency', { amount: money(row.net, row.currency) }) }}
        </p>
      </div>
    </div>
  </section>
</template>
