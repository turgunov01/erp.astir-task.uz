<script setup lang="ts">
import { formatPercent } from '~/utils/finance-period'

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

const { t } = useI18n()

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
          <th :class="TH">{{ t('finance.common.project') }}</th>
          <th :class="TH" class="text-right">{{ t('finance.projects.budget') }}</th>
          <th :class="TH" class="text-right">{{ t('finance.projects.actualCost') }}</th>
          <th :class="TH" class="text-right">{{ t('finance.overview.inflow') }}</th>
          <th :class="TH" class="text-right">{{ t('finance.projects.margin') }}</th>
          <th :class="TH" class="w-44">{{ t('finance.projects.burn') }}</th>
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
              <span class="block text-xs text-muted-foreground">{{ t('finance.projects.plannedCost', { amount: money(row.plannedCost, row.currency) }) }}</span>
            </template>
            <span v-else class="text-xs text-muted-foreground">{{ t('finance.projects.noBudget') }}</span>
          </td>
          <td class="px-4 py-3 text-right tabular-nums">
            {{ money(row.actualCost, row.currency) }}
            <span class="block text-xs text-muted-foreground">
              {{ t('finance.projects.expensesAmount', { amount: money(row.expenses, row.currency) }) }} · {{ t('finance.projects.labourAmount', { amount: money(row.labour, row.currency) }) }}
            </span>
          </td>
          <td class="px-4 py-3 text-right tabular-nums">
            {{ money(row.collected, row.currency) }}
            <span class="block text-xs text-muted-foreground">{{ t('finance.overview.invoicedAmount', { amount: money(row.invoiced, row.currency) }) }}</span>
          </td>
          <td class="px-4 py-3 text-right tabular-nums" :class="marginTone(row.margin)">
            {{ money(row.margin, row.currency) }}
            <span class="block text-xs">{{ row.marginPct === null ? t('finance.projects.noPayments') : formatPercent(row.marginPct) }}</span>
          </td>
          <td class="px-4 py-3">
            <template v-if="row.burnPct !== null">
              <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full" :class="burnTone(row.burnPct)" :style="{ width: Math.min(100, row.burnPct) + '%' }" />
              </div>
              <span class="mt-1 block text-xs tabular-nums" :class="row.burnPct > 100 ? 'font-medium text-destructive' : 'text-muted-foreground'">
                {{ t('finance.projects.burnOfPlan', { percent: formatPercent(row.burnPct) }) }}
              </span>
            </template>
            <span v-else class="text-xs text-muted-foreground">{{ t('finance.projects.noCostPlan') }}</span>
            <span v-if="row.otherCurrencies.length > 0" class="block text-xs text-signal-foreground">
              {{ t('finance.projects.otherCurrenciesSkipped', { currencies: row.otherCurrencies.join(', ') }) }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
