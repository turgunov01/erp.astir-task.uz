<script setup lang="ts">
import { PERMISSION } from '@astir/types'
import type { ProjectRow } from '~/components/finance/FinanceProjectTable.vue'
import { useFinanceQuery } from '~/composables/useFinanceQuery'
import { currentKey, shortMonth } from '~/utils/finance-period'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Финансы' })

interface Kpi {
  currency: string
  inflow: number
  fees: number
  outflow: number
  profit: number
  invoiced: number
  receivable: number
  overdue: number
  overdueCount: number
  payrollNet: number | null
}

interface WatchedInvoice {
  id: string
  number: string
  currency: string
  amount: number
  remaining: number
  dueDate: string | null
  daysLate: number
  daysLeft: number
  client: { id: string, name: string } | null
  project: { id: string, code: string } | null
}

interface PayrollTotals {
  currency: string
  salary: number
  bonuses: number
  otherAccruals: number
  advances: number
  penalties: number
  lateness: number
  lateMinutes: number
  latenessCount: number
  deductions: number
  net: number
  drafts: number
}

interface Overview {
  period: { from: string, to: string, months: string[] }
  currencies: string[]
  kpis: Kpi[]
  cashflow: Array<{ currency: string, months: Array<{ month: string, inflow: number, outflow: number }> }>
  expensesByCategory: Array<{ currency: string, category: string, amount: number, count: number }>
  projects: ProjectRow[]
  invoices: { overdue: WatchedInvoice[], upcoming: WatchedInvoice[], upcomingCount: number, upcomingDays: number }
  payroll: null | {
    month: string
    totals: PayrollTotals[]
    period: Array<{ type: string, currency: string, amount: number, count: number }>
  }
}

const { filters, period, setPeriod } = useFinanceQuery(['currency'] as const, currentKey('month'))

const query = computed(() => ({ from: period.value.from, to: period.value.to }))
const { data, pending, error, refresh } = await useFetch<{ data: Overview }>(
  '/api/finance/overview',
  { query, credentials: 'include', watch: [query] }
)

const stats = computed(() => data.value?.data)

/** The currency the charts are drawn in: the chosen one, else the first. */
const currency = computed(() => {
  const list = stats.value?.currencies ?? []
  return list.includes(filters.currency) ? filters.currency : list[0] ?? 'USD'
})

const flow = computed(() => stats.value?.cashflow.find(row => row.currency === currency.value)?.months ?? [])
const categories = computed(() =>
  (stats.value?.expensesByCategory ?? []).filter(row => row.currency === currency.value))
const categoryMax = computed(() => Math.max(1, ...categories.value.map(row => row.amount)))
const categoryTotal = computed(() => categories.value.reduce((sum, row) => sum + row.amount, 0))

const money = (value: number | null | undefined, code: string) => formatMoney(value, code, 0)

/** The period a list page should open with, so a drill-down shows the same span. */
const periodQuery = computed(() => (period.value.kind === 'custom'
  ? { period: 'custom', from: period.value.from, to: period.value.to }
  : { period: period.value.key }))

const auth = useAuthStore()

/*
 * Each link carries the right its page needs: budgets and payroll are guarded
 * by narrower permissions than this overview, and a link into a 403 is a dead
 * link.
 */
const sectionLinks = computed(() => [
  { to: '/finance/budgets', label: 'Бюджеты', icon: 'lucide:calculator', permission: PERMISSION.BUDGET_VIEW },
  { to: '/finance/expenses', label: 'Расходы', icon: 'lucide:receipt', permission: PERMISSION.FINANCE_VIEW },
  { to: '/finance/payments', label: 'Платежи', icon: 'lucide:credit-card', permission: PERMISSION.FINANCE_VIEW },
  { to: '/finance/invoices', label: 'Счета', icon: 'lucide:file-text', permission: PERMISSION.FINANCE_VIEW },
  { to: '/finance/payroll', label: 'Зарплата: авансы, штрафы, премии', icon: 'lucide:wallet', permission: PERMISSION.PAYROLL_VIEW_OWN },
  { to: '/reports/financial', label: 'Финансовый отчёт', icon: 'lucide:chart-column', permission: [PERMISSION.FINANCE_VIEW, PERMISSION.REPORT_VIEW] }
].filter(link => [link.permission].flat().every(permission => auth.can(permission))))

const PAYROLL_PERIOD_LABEL: Record<string, string> = {
  ADVANCE: 'Авансы', BONUS: 'Премии', PENALTY: 'Штрафы', LATENESS: 'Штрафы за опоздания',
  DEDUCTION: 'Удержания', OTHER_ACCRUAL: 'Прочие начисления'
}

function monthName(month: string) {
  const [year, index] = month.split('-').map(Number) as [number, number]
  return new Date(year, index - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}

const TILE = 'bg-card px-4 py-3.5 sm:px-5'
const LABEL = 'text-xs uppercase tracking-wider text-muted-foreground'
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Финансы</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Финансовый обзор</h1>
      <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
        Кассовый взгляд на период: поступления — оплаченные платежи, расходы — внесённые
        расходы. Дебиторка и просрочка — на сегодня. Суммы в разных валютах не складываются.
      </p>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <FinancePeriodPicker :period="period" @set="setPeriod" />
        <div
          v-if="(stats?.currencies.length ?? 0) > 1"
          role="group"
          aria-label="Валюта графиков"
          class="inline-flex rounded-md border bg-background p-0.5 text-sm"
        >
          <button
            v-for="code in stats?.currencies"
            :key="code"
            type="button"
            :aria-pressed="code === currency"
            class="h-8 rounded px-3 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-secondary aria-pressed:font-medium aria-pressed:text-foreground"
            @click="filters.currency = code"
          >
            {{ code }}
          </button>
        </div>
      </div>
    </header>

    <div v-if="error" class="rounded-xl border bg-card px-6 py-16 text-center">
      <Icon name="lucide:triangle-alert" class="size-8 text-destructive" />
      <p class="mt-3 text-sm font-medium">Не удалось загрузить финансы</p>
      <button type="button" class="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="refresh()">
        Повторить
      </button>
    </div>

    <div v-else-if="pending && !stats" class="space-y-3" aria-busy="true">
      <div v-for="n in 4" :key="n" class="h-24 rounded-xl bg-muted" />
    </div>

    <template v-else-if="stats">
      <p
        v-if="stats.kpis.length === 0"
        class="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground"
      >
        За {{ period.label.toLowerCase() }} нет ни платежей, ни расходов, ни открытых счетов.
      </p>

      <!-- KPIs: one band per currency -->
      <section
        v-for="kpi in stats.kpis"
        :key="kpi.currency"
        :aria-label="'Показатели в ' + kpi.currency"
        class="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3 xl:grid-cols-6"
        :class="pending ? 'opacity-70' : ''"
      >
        <div :class="TILE">
          <p :class="LABEL">Поступления · {{ kpi.currency }}</p>
          <p class="mt-1.5 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {{ money(kpi.inflow, kpi.currency) }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            выставлено {{ money(kpi.invoiced, kpi.currency) }}
            <template v-if="kpi.fees > 0"><br>комиссии {{ money(kpi.fees, kpi.currency) }}</template>
          </p>
        </div>
        <div :class="TILE">
          <p :class="LABEL">Расходы</p>
          <p class="mt-1.5 text-xl font-semibold tabular-nums">{{ money(kpi.outflow, kpi.currency) }}</p>
          <NuxtLink
            :to="{ path: '/finance/expenses', query: { ...periodQuery, currency: kpi.currency } }"
            class="mt-1 inline-block text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            все расходы →
          </NuxtLink>
        </div>
        <div :class="TILE">
          <p :class="LABEL">Прибыль</p>
          <p
            class="mt-1.5 text-xl font-semibold tabular-nums"
            :class="kpi.profit < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'"
          >
            {{ money(kpi.profit, kpi.currency) }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">поступления − комиссии − расходы</p>
        </div>
        <div :class="TILE">
          <p :class="LABEL">Дебиторка</p>
          <p class="mt-1.5 text-xl font-semibold tabular-nums">{{ money(kpi.receivable, kpi.currency) }}</p>
          <p class="mt-1 text-xs text-muted-foreground">неоплаченный остаток счетов</p>
        </div>
        <div :class="TILE">
          <p :class="LABEL">Просрочено</p>
          <p class="mt-1.5 text-xl font-semibold tabular-nums" :class="kpi.overdue > 0 ? 'text-destructive' : ''">
            {{ money(kpi.overdue, kpi.currency) }}
          </p>
          <NuxtLink
            :to="{ path: '/finance/invoices', query: { overdue: 'true', currency: kpi.currency } }"
            class="mt-1 inline-block text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {{ kpi.overdueCount }} счёт(ов) →
          </NuxtLink>
        </div>
        <div :class="TILE">
          <p :class="LABEL">Зарплата к выплате</p>
          <template v-if="stats.payroll">
            <p class="mt-1.5 text-xl font-semibold tabular-nums">
              {{ kpi.payrollNet === null ? '—' : money(kpi.payrollNet, kpi.currency) }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">за {{ monthName(stats.payroll.month) }}</p>
          </template>
          <p v-else class="mt-1.5 text-sm text-muted-foreground">нет доступа к зарплатам</p>
        </div>
      </section>

      <nav class="mb-6 mt-5 flex flex-wrap gap-1.5" aria-label="Разделы финансов">
        <NuxtLink
          v-for="link in sectionLinks"
          :key="link.to"
          :to="link.to"
          class="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          <Icon :name="link.icon" class="size-4 text-muted-foreground" />
          {{ link.label }}
        </NuxtLink>
      </nav>

      <div v-if="stats.kpis.length > 0" class="grid gap-6 lg:grid-cols-5">
        <section class="rounded-xl border bg-card p-4 sm:p-5 lg:col-span-3">
          <h2 class="text-sm font-semibold">Движение денег по месяцам · {{ currency }}</h2>
          <p class="mb-3 mt-0.5 text-xs text-muted-foreground">
            Под каждой парой — итог месяца. Наведите на столбец, чтобы увидеть сумму.
          </p>
          <FinanceCashflow :currency="currency" :months="flow" />
        </section>

        <section class="rounded-xl border bg-card p-4 sm:p-5 lg:col-span-2">
          <h2 class="text-sm font-semibold">Расходы по категориям · {{ currency }}</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Всего {{ money(categoryTotal, currency) }}. Категория открывает список её расходов.
          </p>
          <p v-if="categories.length === 0" class="py-10 text-center text-sm text-muted-foreground">
            Расходов в {{ currency }} за период нет.
          </p>
          <ul v-else class="mt-4 space-y-2.5">
            <li v-for="row in categories" :key="row.category">
              <NuxtLink
                :to="{ path: '/finance/expenses', query: { ...periodQuery, category: row.category, currency } }"
                class="group grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span class="truncate text-sm group-hover:underline">
                  {{ enumLabel(EXPENSE_CATEGORY_LABEL, row.category) }}
                </span>
                <span class="flex min-w-0 items-center gap-2">
                  <span
                    class="h-4 min-w-1 rounded bg-foreground/55 transition-colors group-hover:bg-foreground/80"
                    :style="{ width: (row.amount / categoryMax) * 100 + '%' }"
                  />
                  <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {{ money(row.amount, currency) }}
                    · {{ Math.round((row.amount / categoryTotal) * 100) }}%
                  </span>
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </div>

      <section class="mt-6 rounded-xl border bg-card">
        <header class="border-b px-5 py-3.5">
          <h2 class="text-sm font-medium">Прибыльность проектов</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            Накопительно по {{ formatDay(stats.period.to) }}: факт = расходы + оплаченные по ставке часы,
            маржа = поступления − факт. Худшая маржа сверху.
          </p>
        </header>
        <p v-if="stats.projects.length === 0" class="px-5 py-14 text-center text-sm text-muted-foreground">
          Нет активных проектов с бюджетом или движением денег.
        </p>
        <FinanceProjectTable v-else :rows="stats.projects" />
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border bg-card">
          <header class="flex items-center justify-between gap-3 border-b px-5 py-3.5">
            <h2 class="text-sm font-medium">Просроченные счета</h2>
            <NuxtLink
              :to="{ path: '/finance/invoices', query: { overdue: 'true' } }"
              class="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              все →
            </NuxtLink>
          </header>
          <p v-if="stats.invoices.overdue.length === 0" class="px-5 py-10 text-center text-sm text-muted-foreground">
            Просроченных счетов нет.
          </p>
          <ul v-else class="divide-y">
            <li v-for="invoice in stats.invoices.overdue" :key="invoice.id">
              <NuxtLink
                :to="{ path: '/finance/invoices', query: { search: invoice.number } }"
                class="flex items-start justify-between gap-3 px-5 py-3 hover:bg-secondary/40"
              >
                <span class="min-w-0">
                  <span class="font-medium tabular-nums">{{ invoice.number }}</span>
                  <span class="ml-2 text-sm text-muted-foreground">{{ invoice.client?.name }}</span>
                  <span class="block text-xs text-destructive">
                    срок {{ formatDay(invoice.dueDate) }}<template v-if="invoice.daysLate > 0"> · {{ invoice.daysLate }} дн. просрочки</template><template v-else> · отмечен просроченным</template>
                  </span>
                </span>
                <span class="shrink-0 text-right tabular-nums">
                  <span class="font-medium text-destructive">{{ money(invoice.remaining, invoice.currency) }}</span>
                  <span class="block text-xs text-muted-foreground">из {{ money(invoice.amount, invoice.currency) }}</span>
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section class="rounded-xl border bg-card">
          <header class="border-b px-5 py-3.5">
            <h2 class="text-sm font-medium">К оплате в ближайшие {{ stats.invoices.upcomingDays }} дней</h2>
            <p v-if="stats.invoices.upcomingCount > stats.invoices.upcoming.length" class="mt-0.5 text-xs text-muted-foreground">
              Показаны {{ stats.invoices.upcoming.length }} из {{ stats.invoices.upcomingCount }}
            </p>
          </header>
          <p v-if="stats.invoices.upcoming.length === 0" class="px-5 py-10 text-center text-sm text-muted-foreground">
            В ближайшие дни сроков оплаты нет.
          </p>
          <ul v-else class="divide-y">
            <li v-for="invoice in stats.invoices.upcoming" :key="invoice.id">
              <NuxtLink
                :to="{ path: '/finance/invoices', query: { search: invoice.number } }"
                class="flex items-start justify-between gap-3 px-5 py-3 hover:bg-secondary/40"
              >
                <span class="min-w-0">
                  <span class="font-medium tabular-nums">{{ invoice.number }}</span>
                  <span class="ml-2 text-sm text-muted-foreground">{{ invoice.client?.name }}</span>
                  <span class="block text-xs text-muted-foreground">
                    срок {{ formatDay(invoice.dueDate) }} · {{ invoice.daysLeft === 0 ? 'сегодня' : 'через ' + invoice.daysLeft + ' дн.' }}
                  </span>
                </span>
                <span class="shrink-0 text-right tabular-nums">
                  <span class="font-medium">{{ money(invoice.remaining, invoice.currency) }}</span>
                  <span class="block text-xs text-muted-foreground">из {{ money(invoice.amount, invoice.currency) }}</span>
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </div>

      <section v-if="stats.payroll" class="mt-6 rounded-xl border bg-card">
        <header class="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3.5">
          <div>
            <h2 class="text-sm font-medium">Зарплата за {{ monthName(stats.payroll.month) }}</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              Учтены утверждённые и выплаченные записи. Зарплата не входит в расходы выше,
              пока её не внесли расходом категории «Штат».
            </p>
          </div>
          <NuxtLink
            :to="{ path: '/finance/payroll', query: { period: stats.payroll.month } }"
            class="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            Открыть расчёт
            <Icon name="lucide:arrow-right" class="size-4" />
          </NuxtLink>
        </header>

        <p v-if="stats.payroll.totals.length === 0" class="px-5 py-10 text-center text-sm text-muted-foreground">
          За месяц нет окладов и записей.
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[44rem] text-sm">
            <thead>
              <tr class="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th class="px-5 py-2.5 font-medium">Валюта</th>
                <th class="px-4 py-2.5 text-right font-medium">Оклады</th>
                <th class="px-4 py-2.5 text-right font-medium">Премии</th>
                <th class="px-4 py-2.5 text-right font-medium">Авансы</th>
                <th class="px-4 py-2.5 text-right font-medium">Штрафы</th>
                <th class="px-4 py-2.5 text-right font-medium">Удержания</th>
                <th class="px-5 py-2.5 text-right font-medium">К выплате</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="row in stats.payroll.totals" :key="row.currency">
                <td class="px-5 py-3 font-medium">
                  {{ row.currency }}
                  <span v-if="row.drafts > 0" class="block text-xs font-normal text-signal-foreground">
                    {{ row.drafts }} черновик(ов) не учтено
                  </span>
                </td>
                <td class="px-4 py-3 text-right tabular-nums">{{ money(row.salary, row.currency) }}</td>
                <td class="px-4 py-3 text-right tabular-nums">{{ money(row.bonuses + row.otherAccruals, row.currency) }}</td>
                <td class="px-4 py-3 text-right tabular-nums">{{ money(row.advances, row.currency) }}</td>
                <td class="px-4 py-3 text-right tabular-nums">
                  {{ money(row.penalties + row.lateness, row.currency) }}
                  <span v-if="row.latenessCount > 0" class="block text-xs text-muted-foreground">
                    опозданий {{ row.latenessCount }} · {{ row.lateMinutes }} мин
                  </span>
                </td>
                <td class="px-4 py-3 text-right tabular-nums">{{ money(row.deductions, row.currency) }}</td>
                <td class="px-5 py-3 text-right font-semibold tabular-nums" :class="row.net < 0 ? 'text-destructive' : ''">
                  {{ money(row.net, row.currency) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="stats.period.months.length > 1 && stats.payroll.period.length > 0" class="border-t px-5 py-3.5">
          <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            За весь период: {{ shortMonth(stats.period.months[0]!) }} — {{ shortMonth(stats.period.months.at(-1)!) }}
          </p>
          <ul class="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
            <li v-for="row in stats.payroll.period" :key="row.type + row.currency">
              <span class="text-muted-foreground">{{ labelOf(PAYROLL_PERIOD_LABEL, row.type) }}</span>
              <span class="ml-1.5 font-medium tabular-nums">{{ money(row.amount, row.currency) }}</span>
              <span class="ml-1 text-xs text-muted-foreground">({{ row.count }})</span>
            </li>
          </ul>
        </div>
      </section>
    </template>
  </div>
</template>
