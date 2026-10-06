<script setup lang="ts">
import { apiErrorMessage, apiRequest } from '~/composables/useApi'

/**
 * One payroll month per employee: base salary, what was added, what was
 * withheld, and what is left to pay (client item 7).
 *
 * Rows come split by currency from the API — a salary in som and a bonus in
 * dollars are two lines, never one sum. Only approved and paid entries count;
 * drafts are shown as a count so an unsettled month does not look settled.
 */
const props = defineProps<{
  period: string
  /** Salary can be set from here. */
  canManage: boolean
  /** Caller only sees their own row; the copy speaks to them. */
  ownOnly: boolean
}>()

interface SummaryRow {
  employee: { id: string, name: string, position: string }
  currency: string
  salary: number | null
  bonuses: number
  otherAccruals: number
  advances: number
  penalties: number
  lateness: number
  lateMinutes: number
  latenessCount: number
  deductions: number
  accrued: number
  withheld: number
  net: number
  drafts: number
}

interface Summary {
  period: string
  rows: SummaryRow[]
  totals: Array<Omit<SummaryRow, 'employee' | 'salary'> & { salary: number }>
}

const query = computed(() => ({ period: props.period }))
const { data, pending, error, refresh } = useFetch<{ data: Summary }>(
  '/api/finance/payroll/summary',
  { query, credentials: 'include', watch: [query] }
)

const rows = computed(() => data.value?.data.rows ?? [])
const totals = computed(() => data.value?.data.totals ?? [])

defineExpose({ refresh })

/** Zero reads as a dash: a column of "0 сум" hides the numbers that matter. */
function money(value: number, currency: string) {
  return value === 0 ? '—' : formatMoney(value, currency, 0)
}

function netTone(value: number) {
  return value < 0 ? 'text-destructive' : ''
}

/* ---- salary editor ---- */

const salaryTarget = ref<SummaryRow | null>(null)
const salaryAmount = ref('')
const salaryCurrency = ref('')
const salarySaving = ref(false)
const salaryError = ref('')

function editSalary(row: SummaryRow) {
  salaryTarget.value = row
  salaryAmount.value = row.salary === null ? '' : String(row.salary)
  salaryCurrency.value = row.currency
  salaryError.value = ''
}

async function saveSalary(clear = false) {
  const row = salaryTarget.value
  if (!row) return
  const amount = clear ? null : Number(salaryAmount.value)
  if (!clear && (salaryAmount.value.trim() === '' || Number.isNaN(amount) || (amount ?? 0) < 0)) {
    salaryError.value = 'Укажите оклад числом не меньше нуля'
    return
  }
  salarySaving.value = true
  salaryError.value = ''
  try {
    await apiRequest('/api/finance/payroll/salaries/' + row.employee.id, {
      method: 'PUT',
      body: { amount, currency: salaryCurrency.value.trim() || undefined }
    })
    salaryTarget.value = null
    await refresh()
  } catch (err) {
    salaryError.value = apiErrorMessage(err, 'Не удалось сохранить оклад')
  } finally {
    salarySaving.value = false
  }
}

const TH = 'px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground'
</script>

<template>
  <section class="rounded-xl border bg-card">
    <header class="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3.5">
      <div>
        <h2 class="text-sm font-medium">
          {{ props.ownOnly ? 'Мой расчёт за месяц' : 'Расчёт за месяц по сотрудникам' }}
        </h2>
        <p class="mt-1 text-xs text-muted-foreground">
          К выплате = оклад + премии и начисления − штрафы и удержания − авансы.
          Учитываются только утверждённые и выплаченные записи.
        </p>
      </div>
    </header>

    <div v-if="error" class="px-5 py-12 text-center">
      <p class="text-sm font-medium">Не удалось загрузить расчёт</p>
      <button type="button" class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="refresh()">
        Повторить
      </button>
    </div>

    <div v-else-if="pending && rows.length === 0" class="divide-y">
      <div v-for="n in 4" :key="n" class="flex items-center gap-4 px-5 py-3.5">
        <div class="h-4 flex-1 rounded bg-muted" />
        <div class="h-4 w-24 rounded bg-muted" />
      </div>
    </div>

    <div v-else-if="rows.length === 0" class="px-5 py-14 text-center">
      <Icon name="lucide:hand-coins" class="size-7 text-muted-foreground" />
      <template v-if="props.ownOnly">
        <p class="mt-3 text-sm font-medium">Расчёта пока нет</p>
        <p class="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Он появится, когда ваша учётная запись связана с карточкой сотрудника.
        </p>
      </template>
      <template v-else>
        <p class="mt-3 text-sm font-medium">Нет сотрудников</p>
        <p class="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Здесь перечислены работающие сотрудники и все, у кого есть записи за месяц.
        </p>
      </template>
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[960px] text-sm">
        <thead>
          <tr class="border-b text-left">
            <th :class="TH">Сотрудник</th>
            <th :class="TH" class="text-right">Оклад</th>
            <th :class="TH" class="text-right">Премии</th>
            <th :class="TH" class="text-right">Прочие начисления</th>
            <th :class="TH" class="text-right">Штрафы</th>
            <th :class="TH" class="text-right">Опоздания</th>
            <th :class="TH" class="text-right">Удержания</th>
            <th :class="TH" class="text-right">Авансы</th>
            <th :class="TH" class="text-right">К выплате</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr
            v-for="row in rows"
            :key="row.employee.id + row.currency"
            class="hover:bg-secondary/40"
          >
            <td class="px-4 py-3">
              <p class="font-medium">{{ row.employee.name }}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ row.employee.position }}
                <span v-if="row.drafts > 0" class="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                  черновиков: {{ row.drafts }}
                </span>
              </p>
            </td>
            <td class="px-4 py-3 text-right tabular-nums">
              <button
                v-if="props.canManage"
                type="button"
                class="group inline-flex items-center gap-1.5 rounded px-1 hover:bg-secondary"
                :aria-label="'Изменить оклад: ' + row.employee.name"
                @click="editSalary(row)"
              >
                <span v-if="row.salary !== null">{{ formatMoney(row.salary, row.currency, 0) }}</span>
                <span v-else class="text-muted-foreground">не задан</span>
                <Icon name="lucide:pencil" class="size-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </button>
              <template v-else>
                <span v-if="row.salary !== null">{{ formatMoney(row.salary, row.currency, 0) }}</span>
                <span v-else class="text-muted-foreground">—</span>
              </template>
            </td>
            <td class="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{{ money(row.bonuses, row.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(row.otherAccruals, row.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums text-destructive">{{ money(row.penalties, row.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums text-destructive">
              {{ money(row.lateness, row.currency) }}
              <p v-if="row.latenessCount > 0" class="text-[11px] text-muted-foreground">
                {{ row.latenessCount }} раз · {{ row.lateMinutes }} мин
              </p>
            </td>
            <td class="px-4 py-3 text-right tabular-nums text-destructive">{{ money(row.deductions, row.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(row.advances, row.currency) }}</td>
            <td class="px-4 py-3 text-right font-semibold tabular-nums" :class="netTone(row.net)">
              {{ formatMoney(row.net, row.currency, 0) }}
            </td>
          </tr>
        </tbody>
        <tfoot v-if="!props.ownOnly && totals.length > 0" class="border-t-2">
          <tr v-for="total in totals" :key="total.currency" class="bg-secondary/30 font-medium">
            <td class="px-4 py-3">Итого, {{ total.currency }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.salary, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.bonuses, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.otherAccruals, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.penalties, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.lateness, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.deductions, total.currency) }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ money(total.advances, total.currency) }}</td>
            <td class="px-4 py-3 text-right font-semibold tabular-nums" :class="netTone(total.net)">
              {{ formatMoney(total.net, total.currency, 0) }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div
      v-if="salaryTarget"
      class="fixed inset-0 z-[60] grid place-items-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="salary-title"
    >
      <div class="drawer-scrim absolute inset-0 bg-black/50" @click="salaryTarget = null" />
      <form
        class="dialog-panel relative w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl"
        @submit.prevent="saveSalary()"
      >
        <h2 id="salary-title" class="text-base font-semibold tracking-tight">Оклад в месяц</h2>
        <p class="mt-1 text-sm text-muted-foreground">{{ salaryTarget.employee.name }}</p>

        <div class="mt-4 grid grid-cols-[1fr_88px] gap-3">
          <label class="text-sm">
            <span class="mb-1.5 block text-xs text-muted-foreground">Сумма</span>
            <input
              v-model="salaryAmount"
              type="number"
              min="0"
              step="any"
              class="h-9 w-full rounded-md border bg-background px-2.5 text-sm tabular-nums outline-none focus:border-ring"
              autofocus
            >
          </label>
          <label class="text-sm">
            <span class="mb-1.5 block text-xs text-muted-foreground">Валюта</span>
            <input
              v-model="salaryCurrency"
              maxlength="3"
              class="h-9 w-full rounded-md border bg-background px-2.5 text-sm uppercase outline-none focus:border-ring"
            >
          </label>
        </div>

        <p v-if="salaryError" role="alert" class="mt-3 text-sm text-destructive">{{ salaryError }}</p>

        <div class="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button
            v-if="salaryTarget.salary !== null"
            type="button"
            class="rounded-md px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            :disabled="salarySaving"
            @click="saveSalary(true)"
          >
            Убрать оклад
          </button>
          <span v-else />
          <div class="flex gap-2">
            <button type="button" class="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="salaryTarget = null">
              Отмена
            </button>
            <button
              type="submit"
              class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              :disabled="salarySaving"
            >
              Сохранить
            </button>
          </div>
        </div>
      </form>
    </div>
  </section>
</template>
