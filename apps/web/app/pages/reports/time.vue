<script setup lang="ts">
import { useFilterOptions } from '~/composables/useFilterOptions'
import { printReport, reportCsvHref, useReportPeriod } from '~/composables/useReport'

const { t } = useI18n()

useHead({ title: computed(() => t('finance.reports.time.title')) })

const route = useRoute()
const router = useRouter()
const { from, to, params, reset, isFiltered } = useReportPeriod()
const projectId = ref(String(route.query.projectId ?? ''))

watch(projectId, value => {
  router.replace({ query: { ...route.query, projectId: value || undefined } })
})

const projectOptions = useFilterOptions<{ id: string, code: string, name: string }>(
  '/api/projects',
  row => row.code + ' · ' + row.name
)

const query = computed(() => ({ ...params.value, projectId: projectId.value || undefined }))

interface TimeRow {
  id: string
  name: string
  position: string
  department: string | null
  hourlyRate: number | null
  hours: number
  unpricedHours: number
  cost: number
  projects: number
}

interface TimeReport {
  rows: TimeRow[]
  totals: { hours: number, unpricedHours: number, cost: number, people: number }
}

const { data, pending, error, refresh } = await useFetch<{ data: TimeReport }>(
  '/api/reports/time',
  { query, credentials: 'include' }
)

const report = computed(() => data.value?.data)
const rows = computed(() => report.value?.rows ?? [])

const csvHref = computed(() => reportCsvHref('/api/reports/time', query.value))

const hours = (value: number) => value.toLocaleString(intlTag(), { maximumFractionDigits: 2 })
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{{ t('finance.reports.eyebrow') }}</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('finance.reports.time.heading') }}</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        {{ t('finance.reports.time.intro') }}
      </p>

      <div class="mt-4 flex flex-wrap items-center gap-2 print:hidden">
        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          {{ t('finance.reports.from') }}
          <input
            v-model="from"
            type="date"
            class="h-9 rounded-md border bg-background px-2.5 text-sm text-foreground outline-none focus:border-ring"
          >
        </label>
        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          {{ t('finance.reports.to') }}
          <input
            v-model="to"
            type="date"
            class="h-9 rounded-md border bg-background px-2.5 text-sm text-foreground outline-none focus:border-ring"
          >
        </label>

        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          :aria-label="t('finance.common.project')"
        >
          <option value="">{{ t('finance.filters.allProjects') }}</option>
          <option v-for="option in projectOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>

        <button
          v-if="isFiltered"
          type="button"
          class="h-9 rounded-md px-2.5 text-sm text-muted-foreground hover:text-foreground"
          @click="reset()"
        >
          {{ t('finance.reports.resetDates') }}
        </button>

        <span class="flex-1" />

        <a
          :href="csvHref"
          class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-secondary"
        >
          <Icon name="lucide:download" class="size-4" />
          CSV
        </a>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-secondary"
          @click="printReport()"
        >
          <Icon name="lucide:printer" class="size-4" />
          {{ t('finance.reports.print') }}
        </button>
      </div>
    </header>

    <div
      v-if="error"
      class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center"
    >
      <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
      <p class="mt-3 text-sm">{{ t('finance.reports.failed') }}</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <div v-else-if="pending && rows.length === 0" class="space-y-3">
      <div v-for="n in 5" :key="n" class="h-10 rounded-lg bg-muted" />
    </div>

    <p
      v-else-if="rows.length === 0"
      class="rounded-xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground"
    >
      {{ t('finance.reports.time.empty') }}
    </p>

    <template v-else-if="report">
      <p
        v-if="report.totals.unpricedHours > 0"
        class="mb-4 rounded-lg border border-signal/40 bg-signal/10 px-4 py-2.5 text-sm"
      >
        {{ t('finance.reports.time.unpricedWarning', { hours: hours(report.totals.unpricedHours) }) }}
      </p>

      <div class="mb-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">{{ t('finance.reports.time.people') }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ report.totals.people }}</p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">{{ t('finance.reports.time.hours') }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ hours(report.totals.hours) }}</p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">{{ t('finance.reports.time.cost') }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">
            {{ formatMoney(report.totals.cost, 'USD', 0) }}
          </p>
        </div>
      </div>

      <div class="overflow-x-auto rounded-xl border bg-card">
        <table class="w-full text-sm">
          <thead class="border-b bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th class="px-5 py-2.5 font-medium">{{ t('finance.common.employee') }}</th>
              <th class="px-5 py-2.5 font-medium">{{ t('finance.reports.time.position') }}</th>
              <th class="px-5 py-2.5 font-medium">{{ t('finance.reports.time.department') }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t('finance.reports.time.rate') }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t('finance.reports.time.hours') }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t('finance.reports.time.unpriced') }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t('finance.reports.time.cost') }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t('finance.reports.clients.projects') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-b last:border-0">
              <td class="px-5 py-3 font-medium">{{ row.name }}</td>
              <td class="px-5 py-3 text-muted-foreground">{{ row.position }}</td>
              <td class="px-5 py-3 text-muted-foreground">{{ row.department ?? '—' }}</td>
              <td class="px-5 py-3 text-right tabular-nums">
                <span v-if="row.hourlyRate !== null">
                  {{ formatMoney(row.hourlyRate, 'USD') }}
                </span>
                <span v-else class="text-destructive">{{ t('finance.reports.time.rateNotSet') }}</span>
              </td>
              <td class="px-5 py-3 text-right tabular-nums">{{ hours(row.hours) }}</td>
              <td
                class="px-5 py-3 text-right tabular-nums"
                :class="row.unpricedHours > 0 ? 'text-destructive' : 'text-muted-foreground'"
              >
                {{ hours(row.unpricedHours) }}
              </td>
              <td class="px-5 py-3 text-right tabular-nums">
                {{ formatMoney(row.cost, 'USD', 0) }}
              </td>
              <td class="px-5 py-3 text-right tabular-nums text-muted-foreground">
                {{ row.projects }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
