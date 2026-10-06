<script setup lang="ts">
import { apiErrorMessage, apiRequest } from '~/composables/useApi'

/**
 * A project budget broken down by expense category: what was planned for each
 * one next to what has actually been spent on it.
 *
 * The plan is typed here; the fact is never typed anywhere — it is the sum of
 * the project's expenses in that category, in the budget's currency.
 */
const props = defineProps<{
  budget: {
    id: string
    currency: string
    plannedCost: string
    project: { code: string, name: string } | null
    byCategory: Array<{ category: string, planned: number, actual: number }>
    otherCurrencies: string[]
  }
  canManage: boolean
}>()

const emit = defineEmits<{ close: [], saved: [] }>()

const actualOf = (category: string) =>
  props.budget.byCategory.find(row => row.category === category)?.actual ?? 0

/** Every category is offered, so a plan can be set before the first expense. */
const draft = reactive<Record<string, string>>(Object.fromEntries(
  Object.keys(EXPENSE_CATEGORY_LABEL).map(category => {
    const planned = props.budget.byCategory.find(row => row.category === category)?.planned ?? 0
    return [category, planned > 0 ? String(planned) : '']
  })
))

const rows = computed(() => Object.keys(EXPENSE_CATEGORY_LABEL).map(category => {
  const planned = Number(draft[category] || 0)
  const actual = actualOf(category)
  return {
    category,
    planned,
    actual,
    percent: planned > 0 ? Math.round((actual / planned) * 100) : null
  }
}).filter(row => props.canManage || row.planned > 0 || row.actual > 0))

const plannedTotal = computed(() => rows.value.reduce((sum, row) => sum + row.planned, 0))
const actualTotal = computed(() => rows.value.reduce((sum, row) => sum + row.actual, 0))
const plannedCost = computed(() => Number(props.budget.plannedCost))

const saving = ref(false)
const errorMessage = ref('')

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    await apiRequest('/api/finance/budgets/' + props.budget.id + '/lines', {
      method: 'PUT',
      body: {
        lines: Object.entries(draft)
          .filter(([, value]) => Number(value) > 0)
          .map(([category, value]) => ({ category, plannedAmount: Number(value) }))
      }
    })
    emit('saved')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось сохранить разбивку')
  } finally {
    saving.value = false
  }
}

function barWidth(percent: number | null) {
  return Math.min(100, percent ?? 0) + '%'
}

function barTone(percent: number | null) {
  if (percent === null) return 'bg-muted-foreground/40'
  if (percent > 100) return 'bg-destructive'
  if (percent >= 85) return 'bg-signal'
  return 'bg-emerald-500'
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center" @click.self="emit('close')">
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-lines-title"
      class="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border bg-card shadow-xl sm:max-w-2xl sm:rounded-xl"
    >
      <header class="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 id="budget-lines-title" class="text-base font-semibold">Бюджет по категориям</h2>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ budget.project?.code }} · {{ budget.project?.name }} · {{ budget.currency }}
          </p>
        </div>
        <button
          type="button"
          class="grid size-8 place-items-center rounded-md hover:bg-secondary"
          aria-label="Закрыть"
          @click="emit('close')"
        >
          <Icon name="lucide:x" class="size-4" />
        </button>
      </header>

      <div class="flex-1 overflow-y-auto">
        <p
          v-if="budget.otherCurrencies.length > 0"
          class="border-b bg-signal/10 px-5 py-2 text-xs"
        >
          Есть расходы в {{ budget.otherCurrencies.join(', ') }} — в факт бюджета в {{ budget.currency }} они не входят.
        </p>

        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th class="px-5 py-2 font-medium">Категория</th>
              <th class="px-3 py-2 text-right font-medium">План</th>
              <th class="px-5 py-2 text-right font-medium">Факт</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.category" class="border-b last:border-0">
              <td class="px-5 py-2.5">
                {{ enumLabel(EXPENSE_CATEGORY_LABEL, row.category) }}
                <div class="mt-1.5 h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted">
                  <div class="h-full rounded-full" :class="barTone(row.percent)" :style="{ width: barWidth(row.percent) }" />
                </div>
              </td>
              <td class="px-3 py-2.5 text-right">
                <input
                  v-if="canManage"
                  v-model="draft[row.category]"
                  type="number"
                  min="0"
                  step="any"
                  inputmode="decimal"
                  placeholder="—"
                  :aria-label="'План: ' + enumLabel(EXPENSE_CATEGORY_LABEL, row.category)"
                  class="h-8 w-28 rounded-md border bg-background px-2 text-right text-sm tabular-nums outline-none focus:border-ring sm:w-32"
                >
                <span v-else class="tabular-nums">{{ formatMoney(row.planned, budget.currency, 0) }}</span>
              </td>
              <td class="px-5 py-2.5 text-right tabular-nums">
                {{ row.actual === 0 ? '—' : formatMoney(row.actual, budget.currency, 0) }}
                <span
                  v-if="row.percent !== null"
                  class="block text-xs"
                  :class="row.percent > 100 ? 'text-destructive' : 'text-muted-foreground'"
                >
                  {{ row.percent }}%
                </span>
                <span v-else-if="row.actual > 0" class="block text-xs text-signal-foreground">без плана</span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="border-t bg-muted/30 font-medium">
              <td class="px-5 py-2.5">Итого</td>
              <td class="px-3 py-2.5 text-right tabular-nums">{{ formatMoney(plannedTotal, budget.currency, 0) }}</td>
              <td class="px-5 py-2.5 text-right tabular-nums">{{ formatMoney(actualTotal, budget.currency, 0) }}</td>
            </tr>
          </tfoot>
        </table>

        <p
          v-if="plannedTotal > 0 && Math.round(plannedTotal) !== Math.round(plannedCost)"
          class="px-5 py-2 text-xs text-muted-foreground"
        >
          Сумма по категориям {{ formatMoney(plannedTotal, budget.currency, 0) }} не совпадает с плановой
          себестоимостью бюджета {{ formatMoney(plannedCost, budget.currency, 0) }}.
        </p>
        <p class="px-5 pb-3 text-xs text-muted-foreground">
          Факт — расходы проекта по категории; труд по таймшитам в разбивку не входит.
        </p>
      </div>

      <footer v-if="canManage" class="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">
        <p v-if="errorMessage" role="alert" class="mr-auto text-sm text-destructive">{{ errorMessage }}</p>
        <button type="button" class="h-9 rounded-md border px-3 text-sm hover:bg-secondary" @click="emit('close')">
          Отмена
        </button>
        <button
          type="button"
          class="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? 'Сохраняю…' : 'Сохранить план' }}
        </button>
      </footer>
    </section>
  </div>
</template>
