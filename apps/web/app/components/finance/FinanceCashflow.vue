<script setup lang="ts">
import { shortMonth } from '~/utils/finance-period'

/**
 * Money in against money out, month by month, for one currency.
 *
 * Two bars per month on one scale, so a month that spent more than it took in
 * is visible without reading a single number; the net sits under each pair.
 */
const props = defineProps<{
  currency: string
  months: Array<{ month: string, inflow: number, outflow: number }>
}>()

const max = computed(() =>
  Math.max(1, ...props.months.flatMap(row => [row.inflow, row.outflow])))

const height = (value: number) => (value / max.value) * 100 + '%'
const compact = (value: number) =>
  new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

const empty = computed(() => props.months.every(row => row.inflow === 0 && row.outflow === 0))
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span class="inline-flex items-center gap-1.5">
        <span class="size-2.5 rounded-sm bg-emerald-500" aria-hidden="true" /> Поступления
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="size-2.5 rounded-sm bg-rose-400 dark:bg-rose-500" aria-hidden="true" /> Расходы
      </span>
    </div>

    <p v-if="empty" class="py-10 text-center text-sm text-muted-foreground">
      За период денег в {{ currency }} не двигалось.
    </p>

    <div v-else class="mt-4 overflow-x-auto pb-1">
      <div
        class="flex h-56 min-w-full items-end gap-2"
        :style="{ width: months.length * 4 + 'rem' }"
        role="img"
        :aria-label="'Поступления и расходы по месяцам, ' + currency"
      >
        <div
          v-for="row in months"
          :key="row.month"
          class="flex h-full min-w-14 flex-1 flex-col items-center justify-end gap-1"
        >
          <div class="flex h-full w-full items-end justify-center gap-1">
            <div
              class="w-[42%] rounded-t bg-emerald-500 transition-opacity hover:opacity-80"
              :style="{ height: height(row.inflow), minHeight: row.inflow > 0 ? '2px' : '0' }"
              :title="shortMonth(row.month) + ' · поступления ' + formatMoney(row.inflow, currency, 0)"
            />
            <div
              class="w-[42%] rounded-t bg-rose-400 transition-opacity hover:opacity-80 dark:bg-rose-500"
              :style="{ height: height(row.outflow), minHeight: row.outflow > 0 ? '2px' : '0' }"
              :title="shortMonth(row.month) + ' · расходы ' + formatMoney(row.outflow, currency, 0)"
            />
          </div>
          <span class="w-full truncate border-t pt-1 text-center text-[10px] text-muted-foreground">
            {{ shortMonth(row.month) }}
          </span>
          <span
            class="text-[11px] font-medium tabular-nums"
            :class="row.inflow - row.outflow < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'"
            :title="'Итог месяца: ' + formatMoney(row.inflow - row.outflow, currency, 0)"
          >
            {{ row.inflow - row.outflow > 0 ? '+' : '' }}{{ compact(row.inflow - row.outflow) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
