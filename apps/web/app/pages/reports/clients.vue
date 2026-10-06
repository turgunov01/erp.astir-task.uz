<script setup lang="ts">
import { printReport, reportCsvHref, useReportPeriod } from '~/composables/useReport'

const { t } = useI18n()

useHead({ title: computed(() => t('finance.reports.clients.title')) })

const { from, to, params, reset, isFiltered } = useReportPeriod()

interface ClientRow {
  id: string
  name: string
  status: string
  projects: number
  invoices: number
  currency: string
  invoiced: number
  collected: number
  outstanding: number
  avgDaysToPay: number | null
}

const { data, pending, error, refresh } = await useFetch<{ data: ClientRow[] }>(
  '/api/reports/clients',
  { query: params, credentials: 'include', default: () => ({ data: [] }) }
)

const rows = computed(() => data.value?.data ?? [])

/** A client billed nothing in the period is noise in a money report. */
const billed = computed(() => rows.value.filter(row => row.invoices > 0))

const totals = computed(() => ({
  invoiced: billed.value.reduce((sum, row) => sum + row.invoiced, 0),
  collected: billed.value.reduce((sum, row) => sum + row.collected, 0),
  outstanding: billed.value.reduce((sum, row) => sum + row.outstanding, 0)
}))

const currency = computed(() => billed.value[0]?.currency ?? 'USD')
const mixedCurrencies = computed(() => new Set(billed.value.map(row => row.currency)).size > 1)

const csvHref = computed(() => reportCsvHref('/api/reports/clients', params.value))
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{{ t('finance.reports.eyebrow') }}</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('finance.reports.clients.heading') }}</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        {{ t('finance.reports.clients.intro') }}
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
        <button
          v-if="isFiltered"
          type="button"
          class="h-9 rounded-md px-2.5 text-sm text-muted-foreground hover:text-foreground"
          @click="reset()"
        >
          {{ t('common.actions.reset') }}
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
      v-else-if="billed.length === 0"
      class="rounded-xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground"
    >
      {{ t('finance.reports.clients.empty') }}
    </p>

    <template v-else>
      <p
        v-if="mixedCurrencies"
        class="mb-4 rounded-lg border border-signal/40 bg-signal/10 px-4 py-2.5 text-sm"
      >
        {{ t('finance.reports.clients.mixedCurrencies') }}
      </p>

      <div class="mb-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">{{ t('finance.invoices.totals.invoiced') }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">
            {{ formatMoney(totals.invoiced, currency, 0) }}
          </p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">{{ t('finance.invoices.totals.paid') }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">
            {{ formatMoney(totals.collected, currency, 0) }}
          </p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">{{ t('finance.invoices.columns.remaining') }}</p>
          <p
            class="mt-1 text-xl font-semibold tabular-nums"
            :class="totals.outstanding > 0 ? 'text-destructive' : ''"
          >
            {{ formatMoney(totals.outstanding, currency, 0) }}
          </p>
        </div>
      </div>

      <div class="overflow-x-auto rounded-xl border bg-card">
        <table class="w-full text-sm">
          <thead class="border-b bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th class="px-5 py-2.5 font-medium">{{ t('finance.common.client') }}</th>
              <th class="px-5 py-2.5 font-medium">{{ t('finance.common.status') }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t('finance.reports.clients.projects') }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t('finance.reports.clients.invoices') }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t('finance.invoices.totals.invoiced') }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t('finance.invoices.totals.paid') }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t('finance.invoices.columns.remaining') }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t('finance.reports.clients.daysToPay') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in billed" :key="row.id" class="border-b last:border-0">
              <td class="px-5 py-3 font-medium">{{ row.name }}</td>
              <td class="px-5 py-3"><StatusBadge :status="row.status" /></td>
              <td class="px-5 py-3 text-right tabular-nums text-muted-foreground">
                {{ row.projects }}
              </td>
              <td class="px-5 py-3 text-right tabular-nums text-muted-foreground">
                {{ row.invoices }}
              </td>
              <td class="px-5 py-3 text-right tabular-nums">
                {{ formatMoney(row.invoiced, row.currency, 0) }}
              </td>
              <td class="px-5 py-3 text-right tabular-nums">
                {{ formatMoney(row.collected, row.currency, 0) }}
              </td>
              <td
                class="px-5 py-3 text-right tabular-nums"
                :class="row.outstanding > 0 ? 'text-destructive' : 'text-muted-foreground'"
              >
                {{ formatMoney(row.outstanding, row.currency, 0) }}
              </td>
              <td class="px-5 py-3 text-right tabular-nums">
                <span v-if="row.avgDaysToPay !== null">{{ t('finance.reports.days', row.avgDaysToPay) }}</span>
                <span v-else class="text-muted-foreground">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
