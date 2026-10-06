<script setup lang="ts">
/**
 * Project profitability, cumulative to the end of the chosen period: budget,
 * what was spent, what came in, the margin and how much of the planned cost
 * is used up. Every row is in the project's own currency.
 */
export interface ProjectRow {
  id: string
  code: string
  name: string
  status: string
  client: { id: string, name: string } | null
  currency: string
  hasBudget: boolean
  revenue: number
  plannedCost: number
  expenses: number
  labour: number
  actualCost: number
  invoiced: number
  collected: number
  margin: number
  marginPct: number | null
  burnPct: number | null
  otherCurrencies: string[]
}

defineProps<{ rows: ProjectRow[] }>()

const money = (value: number, currency: string) => formatMoney(value, currency, 0)

function marginTone(value: number) {
  if (value < 0) return 'text-destructive'
  return 'text-emerald-700 dark:text-emerald-400'
}

function burnTone(burn: number | null) {
  if (burn === null) return 'bg-muted-foreground/40'
  if (burn > 100) return 'bg-destructive'
  if (burn >= 85) return 'bg-signal'
  return 'bg-emerald-500'
}

const TH = 'px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground'
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full min-w-[56rem] text-sm">
      <thead>
        <tr class="border-b text-left">
          <th :class="TH">Проект</th>
          <th :class="TH" class="text-right">Бюджет</th>
          <th :class="TH" class="text-right">Факт расходов</th>
          <th :class="TH" class="text-right">Поступления</th>
          <th :class="TH" class="text-right">Маржа</th>
          <th :class="TH" class="w-44">Освоение бюджета</th>
        </tr>
      </thead>
      <tbody class="divide-y">
        <tr v-for="row in rows" :key="row.id" class="hover:bg-secondary/40">
          <td class="px-4 py-3">
            <NuxtLink :to="'/projects/' + row.id" class="font-medium hover:underline">{{ row.code }}</NuxtLink>
            <span class="ml-1.5 text-xs text-muted-foreground">{{ row.currency }}</span>
            <p class="mt-0.5 max-w-64 truncate text-xs text-muted-foreground" :title="row.name">
              {{ row.name }}<template v-if="row.client"> · {{ row.client.name }}</template>
            </p>
          </td>
          <td class="px-4 py-3 text-right tabular-nums">
            <template v-if="row.hasBudget">
              {{ money(row.revenue, row.currency) }}
              <span class="block text-xs text-muted-foreground">затраты {{ money(row.plannedCost, row.currency) }}</span>
            </template>
            <span v-else class="text-xs text-muted-foreground">нет бюджета</span>
          </td>
          <td class="px-4 py-3 text-right tabular-nums">
            {{ money(row.actualCost, row.currency) }}
            <span class="block text-xs text-muted-foreground">
              расходы {{ money(row.expenses, row.currency) }} · труд {{ money(row.labour, row.currency) }}
            </span>
          </td>
          <td class="px-4 py-3 text-right tabular-nums">
            {{ money(row.collected, row.currency) }}
            <span class="block text-xs text-muted-foreground">выставлено {{ money(row.invoiced, row.currency) }}</span>
          </td>
          <td class="px-4 py-3 text-right tabular-nums" :class="marginTone(row.margin)">
            {{ money(row.margin, row.currency) }}
            <span class="block text-xs">{{ row.marginPct === null ? 'оплат не было' : row.marginPct + '%' }}</span>
          </td>
          <td class="px-4 py-3">
            <template v-if="row.burnPct !== null">
              <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full" :class="burnTone(row.burnPct)" :style="{ width: Math.min(100, row.burnPct) + '%' }" />
              </div>
              <span class="mt-1 block text-xs tabular-nums" :class="row.burnPct > 100 ? 'font-medium text-destructive' : 'text-muted-foreground'">
                {{ row.burnPct }}% плана затрат
              </span>
            </template>
            <span v-else class="text-xs text-muted-foreground">нет плана затрат</span>
            <span v-if="row.otherCurrencies.length > 0" class="block text-xs text-signal-foreground">
              + суммы в {{ row.otherCurrencies.join(', ') }} не учтены
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
