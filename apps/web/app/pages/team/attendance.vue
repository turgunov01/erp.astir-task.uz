<script setup lang="ts">
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'
import AttendanceBoard from '~/components/attendance/AttendanceBoard.vue'
import AttendancePeriod from '~/components/attendance/AttendancePeriod.vue'

/**
 * Attendance (Verifix-style): who came to work and who did not, who was
 * late, how long people worked. Arrival is the employee's «Я приехал» press
 * in the header; someone who used the app without pressing shows up as «в
 * системе, не отметился». Both times can be corrected by hand. The owner and
 * the administrator land here after signing in; /attendance redirects here.
 */

const { t } = useI18n()

useHead({ title: computed(() => t('team.attendance.title')) })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const canSeeSchedule = computed(() => auth.can(PERMISSION.SETTINGS_VIEW))

const VIEWS = [
  { key: 'day', labelKey: 'team.attendance.views.day' },
  { key: 'period', labelKey: 'team.attendance.views.period' }
] as const
type ViewKey = typeof VIEWS[number]['key']

const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/** View, day and range live in the URL, so a link shows the same thing. */
const view = computed<ViewKey>(() => (route.query.view === 'period' ? 'period' : 'day'))
const date = computed(() => (isDay(route.query.date) ? route.query.date : null))
const from = computed(() => (isDay(route.query.from) ? route.query.from : null))
const to = computed(() => (isDay(route.query.to) ? route.query.to : null))

function setQuery(patch: Record<string, string | undefined>) {
  router.replace({ query: { ...route.query, ...patch } })
}

interface ScheduleSummary {
  start: string
  end: string
  graceMinutes: number
  weekdays: number[]
  timezone: string
}

/** The schedule line under the title; read from the board's answer. */
const { data: boardHead } = useFetch<{ data: { schedule: ScheduleSummary } }>('/api/attendance/board', {
  credentials: 'include',
  key: 'attendance-schedule',
  pick: ['data']
})
const schedule = computed(() => boardHead.value?.data.schedule ?? null)
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {{ t('team.attendance.eyebrow') }}
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('team.attendance.title') }}</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ t('team.attendance.intro') }}
        <template v-if="schedule">
          {{ t('team.attendance.scheduleLine', {
            start: schedule.start,
            end: schedule.end,
            days: weekdaysLabel(schedule.weekdays),
            grace: schedule.graceMinutes
          }) }}
        </template>
        {{ ' ' }}<NuxtLink
          v-if="canSeeSchedule"
          :to="{ path: '/settings', query: { tab: 'schedule' } }"
          class="whitespace-nowrap underline underline-offset-2 hover:text-foreground"
        >
          {{ t('team.attendance.editSchedule') }}
        </NuxtLink>
      </p>

      <nav class="mt-4 flex gap-1 border-b" :aria-label="t('team.attendance.viewsAria')">
        <button
          v-for="entry in VIEWS"
          :key="entry.key"
          type="button"
          class="-mb-px border-b-2 px-3 py-2 text-sm"
          :class="view === entry.key
            ? 'border-primary font-medium text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'"
          :aria-current="view === entry.key ? 'page' : undefined"
          @click="setQuery({ view: entry.key === 'day' ? undefined : entry.key })"
        >
          {{ t(entry.labelKey) }}
        </button>
      </nav>
    </header>

    <AttendanceBoard
      v-if="view === 'day'"
      :date="date"
      @update:date="value => setQuery({ date: value })"
    />
    <AttendancePeriod
      v-else
      :from="from"
      :to="to"
      @update:range="range => setQuery({ from: range.from, to: range.to })"
    />
  </div>
</template>
