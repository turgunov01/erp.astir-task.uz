<script setup lang="ts">
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import ConfirmDialog from '~/components/ConfirmDialog.vue'
import AttendancePersonCell from '~/components/attendance/AttendancePerson.vue'
import AttendanceEmployeeDays from '~/components/attendance/AttendanceEmployeeDays.vue'
import type { AttendancePerson, AttendanceSchedule, AttendanceTotals } from '~/utils/attendance'

/**
 * A week or a month per employee: days present, missed, late, worked — and
 * the button that turns the period's lateness into payroll drafts.
 */

const props = defineProps<{ from: string | null, to: string | null }>()
const emit = defineEmits<{ (e: 'update:range', value: { from: string, to: string }): void }>()
const { t } = useI18n()

const auth = useAuthStore()
const canFine = computed(() =>
  auth.can(PERMISSION.ATTENDANCE_MANAGE) && auth.can(PERMISSION.PAYROLL_MANAGE)
)
const canSeePayroll = computed(() => auth.can(PERMISSION.PAYROLL_VIEW))

interface PeriodRow {
  employee: AttendancePerson
  totals: AttendanceTotals
}

interface Period {
  from: string
  to: string
  today: string
  schedule: AttendanceSchedule
  rows: PeriodRow[]
}

const query = computed(() => (props.from && props.to ? { from: props.from, to: props.to } : {}))
const { data, pending, error, refresh } = await useFetch<{ data: Period }>('/api/attendance/period', {
  query,
  credentials: 'include',
  watch: [query]
})

const period = computed(() => data.value?.data ?? null)
const errorMessage = computed(() => {
  if (!error.value) return ''
  const body = error.value.data as { error?: { message?: string } } | undefined
  return body?.error?.message ?? t('team.period.loadFailed')
})

/* ----------------------------------------------------------------- ranges */

const presets = computed(() => {
  const today = period.value?.today
  if (!today) return []
  const monday = weekStart(today)
  const monthStart = today.slice(0, 8) + '01'
  const lastMonthEnd = shiftDate(monthStart, -1)
  return [
    { key: 'thisWeek', label: t('team.period.presets.thisWeek'), from: monday, to: today },
    { key: 'lastWeek', label: t('team.period.presets.lastWeek'), from: shiftDate(monday, -7), to: shiftDate(monday, -1) },
    { key: 'thisMonth', label: t('team.period.presets.thisMonth'), from: monthStart, to: today },
    { key: 'lastMonth', label: t('team.period.presets.lastMonth'), from: lastMonthEnd.slice(0, 8) + '01', to: lastMonthEnd }
  ]
})

const isPreset = (preset: { from: string, to: string }) =>
  period.value?.from === preset.from && period.value?.to === preset.to

function setBound(bound: 'from' | 'to', event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (!value || !period.value) return
  const next = { from: period.value.from, to: period.value.to, [bound]: value }
  if (next.from <= next.to) emit('update:range', next)
}

/* ------------------------------------------------------------ the table */

const department = ref('')
const departments = computed(() => {
  const names = new Set<string>()
  for (const row of period.value?.rows ?? []) if (row.employee.department) names.add(row.employee.department.name)
  return [...names].sort((a, b) => a.localeCompare(b, intlTag()))
})
const visible = computed(() =>
  (period.value?.rows ?? []).filter(row => !department.value || row.employee.department?.name === department.value)
)

const sum = computed(() => {
  const total = { presentDays: 0, absentDays: 0, lateDays: 0, lateMinutes: 0, workedMinutes: 0 }
  for (const row of visible.value) {
    total.presentDays += row.totals.presentDays
    total.absentDays += row.totals.absentDays
    total.lateDays += row.totals.lateDays
    total.lateMinutes += row.totals.lateMinutes
    total.workedMinutes += row.totals.workedMinutes
  }
  return total
})

const expanded = ref<string | null>(null)
function toggle(id: string) {
  expanded.value = expanded.value === id ? null : id
}

/* -------------------------------------------------------------- fines */

const confirming = ref(false)
const fining = ref(false)
const fineError = ref('')
const fineResult = ref<{ created: number, skipped: number, total: number, currency: string } | null>(null)

const rateText = computed(() => {
  const schedule = period.value?.schedule
  if (!schedule) return ''
  const parts: string[] = []
  if (schedule.penaltyPerDay > 0) parts.push(t('team.period.ratePerDay', { amount: formatMoney(schedule.penaltyPerDay, schedule.currency) }))
  if (schedule.penaltyPerMinute > 0) parts.push(t('team.period.ratePerMinute', { amount: formatMoney(schedule.penaltyPerMinute, schedule.currency) }))
  return parts.length > 0 ? parts.join(' + ') : t('team.period.rateUnset')
})

async function createFines() {
  if (!period.value) return
  fining.value = true
  fineError.value = ''
  fineResult.value = null
  try {
    const response = await apiRequest<{ data: { created: number, skipped: number, total: number, currency: string } }>(
      '/api/attendance/penalties',
      { method: 'POST', body: { from: period.value.from, to: period.value.to } }
    )
    fineResult.value = response.data
  } catch (err) {
    fineError.value = apiErrorMessage(err, t('team.period.fineFailed'))
  } finally {
    fining.value = false
    confirming.value = false
  }
}

const payrollLink = computed(() => ({
  path: '/finance/payroll',
  query: { tab: 'entries', type: 'LATENESS', status: 'DRAFT', period: period.value?.to.slice(0, 7) }
}))
</script>

<template>
  <div>
    <div class="mb-5 flex flex-wrap items-center gap-2">
      <div class="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1">
        <button
          v-for="preset in presets"
          :key="preset.key"
          type="button"
          class="h-9 shrink-0 rounded-md border px-3 text-sm"
          :class="isPreset(preset) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary'"
          @click="emit('update:range', { from: preset.from, to: preset.to })"
        >
          {{ preset.label }}
        </button>
      </div>
      <div class="flex items-center gap-1.5 text-sm">
        <input
          :value="period?.from"
          :max="period?.to"
          type="date"
          class="h-9 rounded-md border bg-background px-2 text-sm tabular-nums outline-none focus:border-ring"
          :aria-label="t('team.period.from')"
          @change="setBound('from', $event)"
        >
        <span class="text-muted-foreground">—</span>
        <input
          :value="period?.to"
          :min="period?.from"
          :max="period?.today"
          type="date"
          class="h-9 rounded-md border bg-background px-2 text-sm tabular-nums outline-none focus:border-ring"
          :aria-label="t('team.period.to')"
          @change="setBound('to', $event)"
        >
      </div>
      <select
        v-model="department"
        class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
        :aria-label="t('team.departmentFilter')"
      >
        <option value="">{{ t('team.allDepartments') }}</option>
        <option v-for="name in departments" :key="name" :value="name">{{ name }}</option>
      </select>

      <button
        v-if="canFine"
        type="button"
        class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:ml-auto"
        :disabled="!period || fining"
        @click="confirming = true"
      >
        {{ t('team.period.fineButton') }}
      </button>
    </div>

    <p
      v-if="fineError"
      role="alert"
      class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {{ fineError }}
    </p>
    <p
      v-else-if="fineResult"
      class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm"
    >
      <span>
        <i18n-t keypath="team.period.fineCreated" tag="span" scope="global">
          <template #count><b class="tabular-nums">{{ fineResult.created }}</b></template>
          <template #amount>{{ formatMoney(fineResult.total, fineResult.currency) }}</template>
        </i18n-t>
        <template v-if="fineResult.skipped > 0">
          {{ ' ' }}<i18n-t keypath="team.period.fineSkipped" tag="span" scope="global">
            <template #count><span class="tabular-nums">{{ fineResult.skipped }}</span></template>
          </i18n-t>
        </template>
      </span>
      <NuxtLink v-if="canSeePayroll" :to="payrollLink" class="font-medium underline underline-offset-2">
        {{ t('team.period.openPayroll') }}
      </NuxtLink>
    </p>

    <div v-if="pending && !period" class="space-y-2">
      <div v-for="n in 5" :key="n" class="h-14 rounded-xl bg-muted" />
    </div>

    <div v-else-if="errorMessage" class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center">
      <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
      <p class="mt-3 text-sm">{{ errorMessage }}</p>
      <button type="button" class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="refresh()">
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <p v-else-if="visible.length === 0" class="rounded-xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
      {{ t('team.period.empty') }}
    </p>

    <div v-else class="overflow-x-auto rounded-xl border bg-card">
      <table class="w-full min-w-[44rem] text-sm">
        <thead>
          <tr class="border-b text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th class="px-4 py-2.5 font-medium">{{ t('team.period.columns.employee') }}</th>
            <th class="px-3 py-2.5 text-right font-medium">{{ t('team.period.columns.present') }}</th>
            <th class="px-3 py-2.5 text-right font-medium">{{ t('team.period.columns.absent') }}</th>
            <th class="px-3 py-2.5 text-right font-medium">{{ t('team.period.columns.lateDays') }}</th>
            <th class="px-3 py-2.5 text-right font-medium">{{ t('team.period.columns.lateMinutes') }}</th>
            <th class="px-3 py-2.5 text-right font-medium">{{ t('team.period.columns.worked') }}</th>
            <th class="w-10" />
          </tr>
        </thead>
        <tbody>
          <template v-for="row in visible" :key="row.employee.id">
            <tr
              class="cursor-pointer border-b hover:bg-secondary/40"
              :class="expanded === row.employee.id ? 'bg-secondary/40' : ''"
              @click="toggle(row.employee.id)"
            >
              <td class="px-4 py-2.5">
                <AttendancePersonCell :person="row.employee" />
              </td>
              <td class="px-3 py-2.5 text-right tabular-nums">
                {{ row.totals.presentDays }} / {{ row.totals.workingDays }}
                <span
                  v-if="row.totals.unmarkedDays > 0"
                  class="block text-[11px] text-amber-700 dark:text-amber-300"
                  :title="t('team.period.unmarkedTitle', { days: countLabel(row.totals.unmarkedDays, 'team.period.days') })"
                >
                  {{ t('team.period.unmarked', { n: row.totals.unmarkedDays }) }}
                </span>
              </td>
              <td class="px-3 py-2.5 text-right tabular-nums" :class="row.totals.absentDays > 0 ? 'text-destructive' : 'text-muted-foreground'">
                {{ row.totals.absentDays }}
              </td>
              <td class="px-3 py-2.5 text-right tabular-nums" :class="row.totals.lateDays > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'">
                {{ row.totals.lateDays }}
              </td>
              <td class="px-3 py-2.5 text-right tabular-nums">{{ formatMinutes(row.totals.lateMinutes) }}</td>
              <td class="px-3 py-2.5 text-right tabular-nums">{{ formatMinutes(row.totals.workedMinutes) }}</td>
              <td class="px-2 py-2.5 text-right">
                <button
                  type="button"
                  class="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                  :aria-expanded="expanded === row.employee.id"
                  :aria-label="t('team.period.daysAria', { name: row.employee.user.firstName + ' ' + row.employee.user.lastName })"
                  @click.stop="toggle(row.employee.id)"
                >
                  <Icon :name="expanded === row.employee.id ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="size-4" />
                </button>
              </td>
            </tr>
            <tr v-if="expanded === row.employee.id && period" class="border-b">
              <td colspan="7" class="bg-background/60 px-2 py-3 sm:px-4">
                <AttendanceEmployeeDays
                  :employee-id="row.employee.id"
                  :from="period.from"
                  :to="period.to"
                  @changed="refresh()"
                />
              </td>
            </tr>
          </template>
        </tbody>
        <tfoot>
          <tr class="text-xs font-medium text-muted-foreground">
            <td class="px-4 py-2.5">{{ t('team.period.total', { n: visible.length }) }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ sum.presentDays }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ sum.absentDays }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ sum.lateDays }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ formatMinutes(sum.lateMinutes) }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ formatMinutes(sum.workedMinutes) }}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>

    <ConfirmDialog
      v-if="confirming && period"
      :title="t('team.period.confirm.title')"
      :message="t('team.period.confirm.message', { from: shortDate(period.from), to: shortDate(period.to), rate: rateText })"
      :detail="t('team.period.confirm.detail')"
      :confirm-label="t('team.period.confirm.action')"
      tone="neutral"
      :pending="fining"
      @confirm="createFines()"
      @cancel="confirming = false"
    />
  </div>
</template>
