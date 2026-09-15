<script setup lang="ts">
import { useFilterOptions } from '~/composables/useFilterOptions'
import { printReport, reportCsvHref, useReportPeriod } from '~/composables/useReport'

useHead({ title: 'Time report — Aster ERP' })

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

const hours = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Reports</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Время и люди</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        Списанные часы по сотрудникам, оценённые по их ставке. Часы без ставки
        считаются, но ничего не стоят — они вынесены отдельной колонкой.
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

        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Проект"
        >
          <option value="">Все проекты</option>
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
          Сбросить даты
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

    <div v-else-if="pending && rows.length === 0" class="space-y-3">
      <div v-for="n in 5" :key="n" class="h-10 rounded-lg bg-muted" />
    </div>

    <p
      v-else-if="rows.length === 0"
      class="rounded-xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground"
    >
      За выбранный период часы никто не списывал.
    </p>

    <template v-else-if="report">
      <p
        v-if="report.totals.unpricedHours > 0"
        class="mb-4 rounded-lg border border-signal/40 bg-signal/10 px-4 py-2.5 text-sm"
      >
        {{ hours(report.totals.unpricedHours) }} ч списано людьми без ставки — эти
        часы в стоимость не вошли. Итог ниже занижен ровно на них.
      </p>

      <div class="mb-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">Человек</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ report.totals.people }}</p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">Часов</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ hours(report.totals.hours) }}</p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">Стоимость</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">
            {{ formatMoney(report.totals.cost, 'USD', 0) }}
          </p>
        </div>
      </div>

      <div class="overflow-x-auto rounded-xl border bg-card">
        <table class="w-full text-sm">
          <thead class="border-b bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th class="px-5 py-2.5 font-medium">Сотрудник</th>
              <th class="px-5 py-2.5 font-medium">Должность</th>
              <th class="px-5 py-2.5 font-medium">Отдел</th>
              <th class="px-5 py-2.5 text-right font-medium">Ставка</th>
              <th class="px-5 py-2.5 text-right font-medium">Часов</th>
              <th class="px-5 py-2.5 text-right font-medium">Без ставки</th>
              <th class="px-5 py-2.5 text-right font-medium">Стоимость</th>
              <th class="px-5 py-2.5 text-right font-medium">Проектов</th>
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
                <span v-else class="text-destructive">не задана</span>
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
