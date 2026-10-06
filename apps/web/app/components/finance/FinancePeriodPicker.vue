<script setup lang="ts">
import { currentKey, kindOf, shiftPeriod, type ResolvedPeriod } from '~/utils/finance-period'

/**
 * Month / quarter / year / custom range, with arrows to step through them.
 *
 * The parent owns the value (it lives in the URL); this only proposes a new
 * `period` key, plus the two days when the range is custom.
 */
const props = withDefaults(defineProps<{
  period: ResolvedPeriod
  /** Lists may drop the date filter altogether; the dashboard may not. */
  allowAll?: boolean
}>(), { allowAll: false })

const emit = defineEmits<{ set: [key: string, from?: string, to?: string] }>()

const kinds = computed(() => [
  ...(props.allowAll ? [{ value: 'all', label: 'Всё время' }] : []),
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
  { value: 'custom', label: 'Период' }
])

const steppable = computed(() => ['month', 'quarter', 'year'].includes(props.period.kind))

function pick(kind: string) {
  if (kind === props.period.kind) return
  if (kind === 'all') return emit('set', 'all')
  if (kind === 'custom') {
    // Start the custom range from whatever was on screen, so it is a refinement.
    return emit('set', 'custom', props.period.from || currentStart(), props.period.to || today())
  }
  // Switching scale keeps the year (or quarter) the user was looking at.
  const anchor = props.period.from ? new Date(props.period.from + 'T00:00:00') : new Date()
  emit('set', currentKey(kind as 'month' | 'quarter' | 'year', anchor))
}

function step(direction: -1 | 1) {
  if (kindOf(props.period.key)) emit('set', shiftPeriod(props.period.key, direction))
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function currentStart() {
  return today().slice(0, 8) + '01'
}

function setDay(which: 'from' | 'to', value: string) {
  const from = which === 'from' ? value : props.period.from
  const to = which === 'to' ? value : props.period.to
  emit('set', 'custom', from, to)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <div
      role="group"
      aria-label="Масштаб периода"
      class="inline-flex rounded-md border bg-background p-0.5 text-sm"
    >
      <button
        v-for="kind in kinds"
        :key="kind.value"
        type="button"
        :aria-pressed="period.kind === kind.value"
        class="h-8 rounded px-2.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-secondary aria-pressed:font-medium aria-pressed:text-foreground"
        @click="pick(kind.value)"
      >
        {{ kind.label }}
      </button>
    </div>

    <div v-if="steppable" class="inline-flex items-center gap-1">
      <button
        type="button"
        class="grid size-8 place-items-center rounded-md border hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="Предыдущий период"
        @click="step(-1)"
      >
        <Icon name="lucide:chevron-left" class="size-4" />
      </button>
      <span class="min-w-32 text-center text-sm font-medium tabular-nums">{{ period.label }}</span>
      <button
        type="button"
        class="grid size-8 place-items-center rounded-md border hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="Следующий период"
        @click="step(1)"
      >
        <Icon name="lucide:chevron-right" class="size-4" />
      </button>
    </div>

    <div v-else-if="period.kind === 'custom'" class="inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <label class="flex items-center gap-1.5">
        с
        <input
          type="date"
          :value="period.from"
          class="h-8 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
          @change="setDay('from', ($event.target as HTMLInputElement).value)"
        >
      </label>
      <label class="flex items-center gap-1.5">
        по
        <input
          type="date"
          :value="period.to"
          class="h-8 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
          @change="setDay('to', ($event.target as HTMLInputElement).value)"
        >
      </label>
    </div>
  </div>
</template>
