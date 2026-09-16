<script setup lang="ts">
import { printReport, reportCsvHref, useReportPeriod } from '~/composables/useReport'

useHead({ title: 'Financial report' })

const { from, to, params, reset, isFiltered } = useReportPeriod()

interface MonthRow {
  month: string
  invoiced: number
  collected: number
  spent: number
  net: number
}

interface CategoryRow {
  category: string
  amount: number
}

interface AgeingRow {
  key: string
  label: string
  amount: number
  count: number
}

interface FinancialReport {
  byMonth: MonthRow[]
  byCategory: CategoryRow[]
  ageing: AgeingRow[]
  totals: { invoiced: number, collected: number, spent: number, net: number }
  currencies: string[]
}

const { data, pending, error, refresh } = await useFetch<{ data: FinancialReport }>(
  '/api/reports/financial',
  { query: params, credentials: 'include' }
)

const report = computed(() => data.value?.data)
const months = computed(() => report.value?.byMonth ?? [])

/*
 * Every total below adds amounts up regardless of currency. That is only honest
 * while there is one, so when the rows carry several the page says so instead
 * of printing a number that means nothing.
 */
const currency = computed(() => report.value?.currencies[0] ?? 'USD')
const mixedCurrencies = computed(() => (report.value?.currencies.length ?? 0) > 1)

const csv = (section?: string) =>
  reportCsvHref('/api/reports/financial', { ...params.value, section })

/** The API keys months as YYYY-MM; an axis reads better as "окт. 2026". */
function monthLabel(month: string) {
  const [year, index] = month.split('-')
  const date = new Date(Number(year), Number(index) - 1, 1)
  return date.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Reports</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Финансы</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        Выставлено, получено и потрачено по месяцам, структура расходов и
        дебиторка по срокам долга.
      </p>

      <div class="mt-4 flex flex-wrap items-center gap-2 print:hidden">
        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          С
          <input
            v-model="from"
            type="date"
            class="h-9 rounded-md border bg-background px-2.5 text-sm text-foreground outline-none focus:border-ring"
          >
        </label>
        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          по
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
          Сбросить
        </button>

        <span class="flex-1" />

        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-secondary"
          @click="printReport()"
        >
          <Icon name="lucide:printer" class="size-4" />
          Печать
        </button>
      </div>
    </header>

    <div
      v-if="error"
      class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center"
    >
      <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
      <p class="mt-3 text-sm">Не удалось построить отчёт</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <div v-else-if="pending && !report" class="space-y-3">
      <div v-for="n in 5" :key="n" class="h-10 rounded-lg bg-muted" />
    </div>

    <template v-else-if="report">
      <p
        v-if="mixedCurrencies"
        class="mb-4 rounded-lg border border-signal/40 bg-signal/10 px-4 py-2.5 text-sm"
      >
        В выборке несколько валют ({{ report.currencies.join(', ') }}). Итоги ниже
        складывают их как одну — сузьте период или разнесите валюты, прежде чем
        опираться на эти суммы.
      </p>

      <div class="mb-4 grid gap-3 sm:grid-cols-4">
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">Выставлено</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">
            {{ formatMoney(report.totals.invoiced, currency, 0) }}
          </p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">Получено</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">
            {{ formatMoney(report.totals.collected, currency, 0) }}
          </p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">Потрачено</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">
            {{ formatMoney(report.totals.spent, currency, 0) }}
          </p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">Итого</p>
          <p
            class="mt-1 text-xl font-semibold tabular-nums"
            :class="report.totals.net < 0 ? 'text-destructive' : ''"
          >
            {{ formatMoney(report.totals.net, currency, 0) }}
          </p>
        </div>
      </div>

      <section class="mb-6 overflow-hidden rounded-xl border bg-card">
        <header class="flex items-center justify-between border-b px-5 py-3">
          <h2 class="text-sm font-medium">По месяцам</h2>
          <a
            :href="csv('months')"
            class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground print:hidden"
          >
            <Icon name="lucide:download" class="size-3.5" />
            CSV
          </a>
        </header>

        <p v-if="months.length === 0" class="px-5 py-10 text-center text-sm text-muted-foreground">
          За выбранный период движения денег не было.
        </p>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                <th class="px-5 py-2.5 font-medium">Месяц</th>
                <th class="px-5 py-2.5 text-right font-medium">Выставлено</th>
                <th class="px-5 py-2.5 text-right font-medium">Получено</th>
                <th class="px-5 py-2.5 text-right font-medium">Потрачено</th>
                <th class="px-5 py-2.5 text-right font-medium">Итого</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in months" :key="row.month" class="border-b last:border-0">
                <td class="px-5 py-3">{{ monthLabel(row.month) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">
                  {{ formatMoney(row.invoiced, currency, 0) }}
                </td>
                <td class="px-5 py-3 text-right tabular-nums">
                  {{ formatMoney(row.collected, currency, 0) }}
                </td>
                <td class="px-5 py-3 text-right tabular-nums">
                  {{ formatMoney(row.spent, currency, 0) }}
                </td>
                <td
                  class="px-5 py-3 text-right tabular-nums"
                  :class="row.net < 0 ? 'text-destructive' : ''"
                >
                  {{ formatMoney(row.net, currency, 0) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <section class="overflow-hidden rounded-xl border bg-card">
          <header class="flex items-center justify-between border-b px-5 py-3">
            <h2 class="text-sm font-medium">Расходы по категориям</h2>
            <a
              :href="csv('categories')"
              class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground print:hidden"
            >
              <Icon name="lucide:download" class="size-3.5" />
              CSV
            </a>
          </header>

          <p
            v-if="report.byCategory.length === 0"
            class="px-5 py-10 text-center text-sm text-muted-foreground"
          >
            Расходов за период нет.
          </p>

          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
            <tbody>
              <tr
                v-for="row in report.byCategory"
                :key="row.category"
                class="border-b last:border-0"
              >
                <td class="px-5 py-2.5">{{ enumLabel(EXPENSE_CATEGORY_LABEL, row.category) }}</td>
                <td class="px-5 py-2.5 text-right tabular-nums">
                  {{ formatMoney(row.amount, currency, 0) }}
                </td>
              </tr>
            </tbody>
            </table>
          </div>
        </section>

        <section class="overflow-hidden rounded-xl border bg-card">
          <header class="flex items-center justify-between border-b px-5 py-3">
            <h2 class="text-sm font-medium">Дебиторка по срокам</h2>
            <a
              :href="csv('ageing')"
              class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground print:hidden"
            >
              <Icon name="lucide:download" class="size-3.5" />
              CSV
            </a>
          </header>

          <p class="border-b px-5 py-2 text-xs text-muted-foreground">
            Неоплаченные счета на сегодня — период отчёта на эту таблицу не влияет.
          </p>

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
            <tbody>
              <tr v-for="row in report.ageing" :key="row.key" class="border-b last:border-0">
                <td
                  class="px-5 py-2.5"
                  :class="row.key === 'over90' && row.count > 0 ? 'text-destructive' : ''"
                >
                  {{ row.label }}
                </td>
                <td class="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                  {{ row.count }}
                </td>
                <td class="px-5 py-2.5 text-right tabular-nums">
                  {{ formatMoney(row.amount, currency, 0) }}
                </td>
              </tr>
            </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
