<script setup lang="ts">
/**
 * The totals row of a finance list: one line per currency, covering every row
 * the filter matched rather than the visible page. Currencies are never added
 * together — there is no rate on file to do it honestly.
 */
export interface TotalsField {
  key: string
  label: string
  /** Colour the figure: debt in red, received in green. */
  tone?: 'danger' | 'positive' | 'muted'
  /** Hide the figure when it is zero, e.g. VAT on a ledger without any. */
  hideZero?: boolean
}

defineProps<{
  rows: Array<{ currency: string, count: number }>
  fields: TotalsField[]
  pending?: boolean
}>()

const { t } = useI18n()

const TONE: Record<string, string> = {
  danger: 'text-destructive',
  positive: 'text-emerald-700 dark:text-emerald-400',
  muted: 'text-muted-foreground'
}

/** A figure off a totals row; the rows are typed per page, read here by key. */
const num = (row: object, key: string) => Number((row as Record<string, unknown>)[key] ?? 0)
</script>

<template>
  <section
    v-if="rows.length > 0"
    :aria-label="t('finance.totals.aria')"
    class="mt-3 overflow-hidden rounded-xl border bg-card"
    :class="pending ? 'opacity-60' : ''"
  >
    <div
      v-for="row in rows"
      :key="row.currency"
      class="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 border-b px-4 py-3 last:border-0 sm:px-5"
    >
      <p class="w-full text-xs font-medium uppercase tracking-wider text-muted-foreground sm:w-auto sm:min-w-28">
        {{ t('finance.totals.total', { currency: row.currency }) }}
        <span class="ml-1 font-normal normal-case tracking-normal">· {{ t('finance.totals.records', row.count) }}</span>
      </p>
      <template v-for="field in fields" :key="field.key">
        <p v-if="!(field.hideZero && num(row, field.key) === 0)" class="text-sm">
          <span class="text-muted-foreground">{{ field.label }}</span>
          <span class="ml-1.5 font-semibold tabular-nums" :class="field.tone ? TONE[field.tone] : ''">
            {{ formatMoney(num(row, field.key), row.currency) }}
          </span>
        </p>
      </template>
    </div>
  </section>
</template>
