<script setup lang="ts">
import { apiErrorMessage, apiRequest } from '~/composables/useApi'

/**
 * «Выплаты за месяц»: every payout recorded for the month, with the figures it
 * was worked out from and, for whoever may manage payroll, a way to undo one
 * recorded by mistake (the entries it settled go back to approved).
 */
const props = defineProps<{ period: string, canManage: boolean, ownOnly: boolean }>()
const emit = defineEmits<{ changed: [] }>()

interface Payout {
  id: string
  period: string
  currency: string
  amount: string
  net: string
  workedMinutes: number
  normMinutes: number
  note: string | null
  paidAt: string
  employee: { id: string, position: string, user: { firstName: string, lastName: string } }
  paidBy: { id: string, firstName: string, lastName: string } | null
}

const { t } = useI18n()

const query = computed(() => ({ period: props.period }))
const { data, refresh } = useFetch<{ data: Payout[] }>(
  '/api/finance/payroll/payouts',
  { query, credentials: 'include', watch: [query] }
)
const payouts = computed(() => data.value?.data ?? [])

defineExpose({ refresh })

const undoing = ref<Payout | null>(null)
const busy = ref(false)
const error = ref('')

async function undo() {
  const payout = undoing.value
  if (!payout) return
  busy.value = true
  error.value = ''
  try {
    await apiRequest('/api/finance/payroll/payouts/' + payout.id, { method: 'DELETE' })
    undoing.value = null
    await refresh()
    emit('changed')
  } catch (err) {
    error.value = apiErrorMessage(err, t('finance.payroll.payouts.undoFailed'))
    undoing.value = null
  } finally {
    busy.value = false
  }
}

const hours = (minutes: number) => String(Math.round(minutes / 60))
</script>

<template>
  <section v-if="payouts.length > 0" class="mt-4 rounded-xl border bg-card">
    <header class="border-b px-5 py-3.5">
      <h2 class="text-sm font-medium">{{ t('finance.payroll.payouts.title') }}</h2>
      <p class="mt-1 text-xs text-muted-foreground">{{ t('finance.payroll.payouts.hint') }}</p>
    </header>
    <p v-if="error" role="alert" class="border-b px-5 py-2.5 text-sm text-destructive">{{ error }}</p>
    <ul class="divide-y">
      <li v-for="payout in payouts" :key="payout.id" class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
        <div class="min-w-0 flex-1">
          <p v-if="!props.ownOnly" class="font-medium">{{ fullName(payout.employee.user) }}</p>
          <p class="text-xs text-muted-foreground">
            {{ t('finance.payroll.payouts.when', { date: formatDay(payout.paidAt) }) }}
            <template v-if="payout.paidBy"> · {{ fullName(payout.paidBy) }}</template>
            · {{ t('finance.payroll.payouts.hours', { worked: hours(payout.workedMinutes), norm: hours(payout.normMinutes) }) }}
          </p>
          <p v-if="payout.note" class="mt-0.5 text-xs">{{ payout.note }}</p>
        </div>
        <span class="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
          {{ formatMoney(Number(payout.amount), payout.currency, 0) }}
        </span>
        <button
          v-if="props.canManage"
          type="button"
          class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          @click="undoing = payout"
        >
          <Icon name="lucide:undo-2" class="size-3.5" />
          {{ t('finance.payroll.payouts.undo') }}
        </button>
      </li>
    </ul>

    <ConfirmDialog
      v-if="undoing"
      :title="t('finance.payroll.payouts.undoTitle')"
      :message="t('finance.payroll.payouts.undoMessage', {
        name: fullName(undoing.employee.user),
        amount: formatMoney(Number(undoing.amount), undoing.currency, 0)
      })"
      :confirm-label="t('finance.payroll.payouts.undo')"
      :pending="busy"
      @confirm="undo()"
      @cancel="undoing = null"
    />
  </section>
</template>
