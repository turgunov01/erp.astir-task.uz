<script setup lang="ts">
/**
 * «По дням» — one employee's month day by day: when the shift started and
 * ended, the day's share of the salary, worked time, what it earned, pauses,
 * fines and the day's total, with the month's sums on top.
 *
 * An employee sees only their own month (the API ignores employeeId for
 * them); whoever sees everyone's payroll picks the person here.
 */
const props = defineProps<{
  period: string
  canViewAll: boolean
  employeeOptions: Array<{ value: string, label: string }>
}>()
const employeeId = defineModel<string>('employeeId', { default: '' })

const { t } = useI18n()

interface PayrollDay {
  date: string
  isWorkingDay: boolean
  isFuture: boolean
  checkInAt: string | null
  checkOutAt: string | null
  workedMinutes: number
  pausedMinutes: number
  pauseCount: number
  lateMinutes: number
  dayRate: number
  earned: number
  bonuses: number
  fines: number
  withheld: number
  total: number
}

interface DaysMonth {
  tracked: true
  period: string
  timezone: string
  currency: string
  salary: number | null
  employee: { id: string, name: string, position: string }
  totals: {
    days: number
    workingDays: number
    daysStarted: number
    daysEnded: number
    normMinutes: number
    workedMinutes: number
    pausedMinutes: number
    earned: number
    bonuses: number
    fines: number
    withheld: number
    total: number
  }
  days: PayrollDay[]
}

const query = computed(() => ({
  period: props.period,
  employeeId: props.canViewAll && employeeId.value ? employeeId.value : undefined
}))
const { data, pending, error, refresh } = useFetch<{ data: DaysMonth | { tracked: false } }>(
  '/api/finance/payroll/days',
  { query, credentials: 'include', watch: [query] }
)
defineExpose({ refresh })

const month = computed(() => {
  const answer = data.value?.data
  return answer && answer.tracked ? answer : null
})
const currency = computed(() => month.value?.currency ?? 'UZS')
const money = (value: number) => formatMoney(value, currency.value, 0)
const clock = (value: string | null) => (value ? studioClock(value, month.value?.timezone ?? 'Asia/Tashkent') : '—:—')

/** Missed working day in the past: red; late: amber; days off and future: quiet. */
function rowTone(day: PayrollDay): string {
  if (!day.isWorkingDay || day.isFuture) return 'text-muted-foreground'
  if (!day.checkInAt) return 'bg-destructive/10'
  if (day.lateMinutes > 0) return 'bg-amber-100/60 dark:bg-amber-400/10'
  return ''
}

const TH = 'whitespace-nowrap px-3 py-2.5 text-xs font-medium text-muted-foreground'
const TD = 'whitespace-nowrap px-3 py-2 tabular-nums'
</script>

<template>
  <section class="rounded-xl border bg-card">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div class="min-w-0">
        <h2 class="text-base font-semibold">{{ month?.employee.name ?? t('finance.payroll.days.title') }}</h2>
        <p class="text-xs text-muted-foreground">
          <template v-if="month">
            {{ month.employee.position }} ·
            {{ month.salary !== null ? t('finance.payroll.days.salary', { amount: money(month.salary) }) : t('finance.payroll.days.noSalary') }}
          </template>
          <template v-else>{{ t('finance.payroll.days.intro') }}</template>
        </p>
      </div>
      <select
        v-if="canViewAll"
        v-model="employeeId"
        class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
        :aria-label="t('finance.common.employee')"
      >
        <option value="">{{ t('finance.payroll.days.me') }}</option>
        <option v-for="option in employeeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </div>

    <div v-if="pending && !data" class="space-y-2 p-4" aria-busy="true">
      <div v-for="n in 6" :key="n" class="h-8 rounded bg-muted" />
    </div>

    <div v-else-if="error" class="px-4 py-6 text-sm">
      <span class="text-muted-foreground">{{ t('finance.payroll.days.loadFailed') }}</span>
      <button type="button" class="ml-2 underline underline-offset-2" @click="refresh()">{{ t('common.actions.retry') }}</button>
    </div>

    <p v-else-if="!month" class="px-4 py-6 text-sm text-muted-foreground">{{ t('finance.payroll.days.notLinked') }}</p>

    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b bg-muted/40 text-center">
          <tr>
            <th :class="TH" class="text-left">{{ t('finance.payroll.days.columns.date') }}</th>
            <th :class="TH">{{ t('finance.payroll.days.columns.started') }}</th>
            <th :class="TH">{{ t('finance.payroll.days.columns.ended') }}</th>
            <th :class="TH">{{ t('finance.payroll.days.columns.dayRate') }}</th>
            <th :class="TH">{{ t('finance.payroll.days.columns.worked') }}</th>
            <th :class="TH">{{ t('finance.payroll.days.columns.earned') }}</th>
            <th :class="TH">{{ t('finance.payroll.days.columns.pause') }}</th>
            <th :class="TH">{{ t('finance.payroll.days.columns.bonuses') }}</th>
            <th :class="TH">{{ t('finance.payroll.days.columns.fines') }}</th>
            <th :class="TH">{{ t('finance.payroll.days.columns.total') }}</th>
          </tr>
          <tr class="border-t bg-card font-semibold text-foreground">
            <td :class="TD" class="text-left">{{ t('finance.payroll.days.daysCount', { n: month.totals.days }) }}</td>
            <td :class="TD">{{ t('finance.payroll.days.daysCount', { n: month.totals.daysStarted }) }}</td>
            <td :class="TD">{{ t('finance.payroll.days.daysCount', { n: month.totals.daysEnded }) }}</td>
            <td :class="TD">
              {{ month.salary !== null ? money(month.salary) : '—' }}
              <span class="block text-[11px] font-normal text-muted-foreground">{{ t('finance.payroll.days.monthSalary') }}</span>
            </td>
            <td :class="TD">
              {{ formatMinutes(month.totals.workedMinutes) }}
              <span class="block text-[11px] font-normal text-muted-foreground">
                {{ t('finance.payroll.days.ofNorm', { norm: formatMinutes(month.totals.normMinutes) }) }}
              </span>
            </td>
            <td :class="TD">{{ money(month.totals.earned) }}</td>
            <td :class="TD">{{ formatMinutes(month.totals.pausedMinutes) }}</td>
            <td :class="TD" class="text-emerald-700 dark:text-emerald-400">{{ money(month.totals.bonuses) }}</td>
            <td :class="TD" class="text-destructive">{{ money(month.totals.fines + month.totals.withheld) }}</td>
            <td :class="[TD, month.totals.total < 0 ? 'text-destructive' : '']">{{ money(month.totals.total) }}</td>
          </tr>
        </thead>
        <tbody class="divide-y text-center">
          <tr v-for="day in month.days" :key="day.date" :class="rowTone(day)">
            <td :class="TD" class="text-left font-medium">
              {{ shortDate(day.date) }}
              <span v-if="!day.isWorkingDay" class="ml-1 text-[11px] font-normal">{{ t('finance.payroll.days.dayOff') }}</span>
            </td>
            <td :class="TD">
              {{ clock(day.checkInAt) }}
              <span v-if="day.lateMinutes" class="block text-[11px] text-amber-800 dark:text-amber-300">
                {{ t('finance.payroll.days.late', { time: formatMinutes(day.lateMinutes) }) }}
              </span>
            </td>
            <td :class="TD">{{ clock(day.checkOutAt) }}</td>
            <td :class="TD">{{ day.dayRate ? money(day.dayRate) : '—' }}</td>
            <td :class="TD">{{ formatMinutes(day.workedMinutes) }}</td>
            <td :class="TD">{{ day.earned ? money(day.earned) : '—' }}</td>
            <td :class="TD">
              {{ formatMinutes(day.pausedMinutes) }}
              <span v-if="day.pauseCount" class="block text-[11px] text-muted-foreground">× {{ day.pauseCount }}</span>
            </td>
            <td :class="[TD, day.bonuses ? 'text-emerald-700 dark:text-emerald-400' : '']">{{ day.bonuses ? '+ ' + money(day.bonuses) : '—' }}</td>
            <td :class="[TD, day.fines + day.withheld ? 'text-destructive' : '']">{{ day.fines + day.withheld ? '− ' + money(day.fines + day.withheld) : '—' }}</td>
            <td :class="[TD, 'font-medium', day.total < 0 ? 'text-destructive' : '']">{{ day.total ? money(day.total) : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p class="border-t px-4 py-2.5 text-xs text-muted-foreground">{{ t('finance.payroll.days.footnote') }}</p>
    </div>
  </section>
</template>
