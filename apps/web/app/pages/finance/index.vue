<script setup lang="ts">
useHead({ title: 'Финансы — Aster ERP' })

interface ProjectRow {
  id: string
  code: string
  name: string
  currency: string
  revenue: number
  actualCost: number
  profit: number
  margin: number
}

interface Overview {
  totals: { revenue: number, actualCost: number, profit: number, collected: number, margin: number }
  overdueInvoices: number
  pendingPayments: number
  projects: ProjectRow[]
}

const { data, pending, error, refresh } = await useFetch<{ data: Overview }>(
  '/api/finance/overview',
  { credentials: 'include' }
)

const stats = computed(() => data.value?.data)

function money(value: number | undefined, currency = 'USD') {
  if (value === undefined) return '—'
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency, maximumFractionDigits: 0
  }).format(value)
}

/** Negative margin is the signal the page exists for. */
function marginTone(margin: number) {
  if (margin < 0) return 'text-destructive'
  if (margin < 15) return 'text-signal-foreground'
  return 'text-emerald-600 dark:text-emerald-400'
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Finance</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Финансовый обзор</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Фактическая себестоимость считается из расходов и списанных часов, а не вводится вручную.
      </p>
    </header>

    <div v-if="error" class="rounded-xl border bg-card px-6 py-16 text-center">
      <Icon name="lucide:triangle-alert" class="size-8 text-destructive" />
      <p class="mt-3 text-sm font-medium">Не удалось загрузить финансы</p>
      <button type="button" class="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="refresh()">
        Повторить
      </button>
    </div>

    <template v-else>
      <section class="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">Выручка</p>
          <p class="mt-1.5 text-2xl font-semibold tabular-nums">
            <span v-if="pending" class="inline-block h-7 w-24 rounded bg-muted" />
            <template v-else>{{ money(stats?.totals.revenue) }}</template>
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            собрано {{ money(stats?.totals.collected) }}
          </p>
        </div>
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">Себестоимость</p>
          <p class="mt-1.5 text-2xl font-semibold tabular-nums">{{ money(stats?.totals.actualCost) }}</p>
          <p class="mt-1 text-xs text-muted-foreground">расходы + труд</p>
        </div>
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">Прибыль</p>
          <p class="mt-1.5 text-2xl font-semibold tabular-nums" :class="marginTone(stats?.totals.margin ?? 0)">
            {{ money(stats?.totals.profit) }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">маржа {{ stats?.totals.margin ?? 0 }}%</p>
        </div>
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">Требует внимания</p>
          <p class="mt-1.5 text-2xl font-semibold tabular-nums" :class="(stats?.overdueInvoices ?? 0) > 0 ? 'text-destructive' : ''">
            {{ stats?.overdueInvoices ?? 0 }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            просроченных счетов · {{ stats?.pendingPayments ?? 0 }} платежей в ожидании
          </p>
        </div>
      </section>

      <nav class="mt-6 flex flex-wrap gap-1.5">
        <NuxtLink
          v-for="link in [
            { to: '/finance/budgets', label: 'Бюджеты' },
            { to: '/finance/expenses', label: 'Расходы' },
            { to: '/finance/payments', label: 'Платежи' },
            { to: '/finance/invoices', label: 'Счета' }
          ]"
          :key="link.to"
          :to="link.to"
          class="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>

      <section class="mt-6 rounded-xl border bg-card">
        <header class="border-b px-5 py-3.5">
          <h2 class="text-sm font-medium">Прибыльность по проектам</h2>
          <p class="mt-1 text-xs text-muted-foreground">Отсортировано по марже — убыточные сверху</p>
        </header>

        <div v-if="pending" class="divide-y">
          <div v-for="n in 5" :key="n" class="flex items-center gap-4 px-5 py-3.5">
            <div class="h-4 flex-1 rounded bg-muted" />
            <div class="h-4 w-20 rounded bg-muted" />
          </div>
        </div>

        <p v-else-if="(stats?.projects.length ?? 0) === 0" class="px-5 py-14 text-center text-sm text-muted-foreground">
          Нет проектов с финансовыми данными
        </p>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b text-left">
                <th class="px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Проект</th>
                <th class="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Выручка</th>
                <th class="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Себестоимость</th>
                <th class="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Прибыль</th>
                <th class="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Маржа</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="row in stats?.projects" :key="row.id" class="hover:bg-secondary/40">
                <td class="px-5 py-3">
                  <NuxtLink :to="'/projects/' + row.id" class="font-medium hover:underline">
                    {{ row.code }}
                  </NuxtLink>
                  <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ row.name }}</p>
                </td>
                <td class="px-5 py-3 text-right tabular-nums">{{ money(row.revenue, row.currency) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ money(row.actualCost, row.currency) }}</td>
                <td class="px-5 py-3 text-right tabular-nums" :class="marginTone(row.margin)">
                  {{ money(row.profit, row.currency) }}
                </td>
                <td class="px-5 py-3 text-right font-medium tabular-nums" :class="marginTone(row.margin)">
                  {{ row.margin }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
