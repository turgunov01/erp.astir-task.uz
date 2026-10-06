<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { BUDGET_FORM } from '~/utils/entity-forms'
import { formatPercent } from '~/utils/finance-period'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

const { t } = useI18n()

useHead({ title: computed(() => t('finance.nav.budgets')) })

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.FINANCE_MANAGE))

/*
 * The endpoint returns every budget in one response — there is at most one per
 * project, so the list is bounded by the project count and needs no paging.
 */
const filters = computed(() => ({}))

interface BudgetRow {
  id: string
  revenue: string
  plannedCost: string
  currency: string
  project: {
    id: string
    code: string
    name: string
    status: string
    client: { id: string, name: string } | null
  } | null
  actual: {
    expenses: number
    labour: number
    cost: number
    collected: number
    invoiced: number
    burn: number | null
    unpricedHours: number
  }
  byCategory: Array<{ category: string, planned: number, actual: number }>
  otherCurrencies: string[]
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<BudgetRow>('/api/finance/budgets', filters as never)

/** All budgets are already here, so the search box narrows them in place. */
const search = ref('')
const visible = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return items.value
  return items.value.filter(row => [row.project?.code, row.project?.name, row.project?.client?.name]
    .some(value => value?.toLowerCase().includes(needle)))
})

const crud = useEntityCrud({
  endpoint: '/api/finance/budgets',
  refresh: () => refresh(),
  entityLabel: () => t('finance.budgets.entity'),
  nameOf: row => (row as BudgetRow).project?.code ?? t('finance.filters.noProject')
})

/** Planned margin: what the project was sold on. */
function plannedMargin(row: BudgetRow) {
  const revenue = Number(row.revenue)
  if (revenue <= 0) return null
  return Math.round(((revenue - Number(row.plannedCost)) / revenue) * 100)
}

/** Margin on what actually came in, against everything actually spent. */
function actualMargin(row: BudgetRow) {
  return row.actual.collected - row.actual.cost
}

function burnTone(burn: number | null) {
  if (burn === null) return 'bg-muted-foreground/40'
  if (burn > 100) return 'bg-destructive'
  if (burn >= 85) return 'bg-signal'
  return 'bg-emerald-500'
}

const plannedCategories = (row: BudgetRow) => row.byCategory.filter(line => line.planned > 0).length

const editing = ref<BudgetRow | null>(null)

async function onLinesSaved() {
  editing.value = null
  await refresh()
}

const columns = computed<Column[]>(() => [
  { key: 'project', label: t('finance.common.project'), width: '24%' },
  { key: 'plan', label: t('finance.budgets.columns.plan'), width: '17%', numeric: true },
  { key: 'cost', label: t('finance.projects.actualCost'), width: '19%', numeric: true },
  { key: 'collected', label: t('finance.budgets.columns.collected'), width: '15%', numeric: true },
  { key: 'margin', label: t('finance.budgets.columns.margin'), width: '15%', numeric: true },
  { key: 'actions', label: '', width: '56px' }
])
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{{ t('finance.nav.overview') }}</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('finance.nav.budgets') }}</h1>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <i18n-t keypath="finance.budgets.intro" tag="p" scope="global" class="max-w-2xl text-sm text-muted-foreground">
          <template #link>
            <NuxtLink to="/finance" class="text-foreground underline underline-offset-4">{{ t('finance.budgets.introLink') }}</NuxtLink>
          </template>
        </i18n-t>
        <EntityToolbar :crud="crud" :create-label="t('finance.budgets.create')" :can-manage="canManage" />
      </div>
    </header>

    <DataTable
      :columns="columns"
      v-model:search="search"
      :rows="visible"
      :search-placeholder="t('finance.budgets.searchPlaceholder')"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      empty-icon="lucide:calculator"
      :empty-title="t('finance.budgets.empty')"
      :empty-body="t('finance.budgets.emptyBody')"
      @retry="refresh"
    >
      <template #cell-project="{ row }">
        <NuxtLink
          v-if="row.project"
          :to="'/projects/' + row.project.id"
          class="font-medium hover:underline"
        >
          {{ row.project.code }} · {{ row.project.name }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
        <span class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge v-if="row.project" :status="row.project.status" />
          <span v-if="row.project?.client">{{ row.project.client.name }}</span>
        </span>
      </template>
      <template #cell-plan="{ row }">
        <span class="tabular-nums">{{ formatMoney(Number(row.revenue), row.currency, 0) }}</span>
        <span class="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          {{ t('finance.projects.plannedCost', { amount: formatMoney(Number(row.plannedCost), row.currency, 0) }) }}
        </span>
      </template>
      <template #cell-cost="{ row }">
        <span class="tabular-nums" :class="(row.actual.burn ?? 0) > 100 ? 'font-medium text-destructive' : ''">
          {{ formatMoney(row.actual.cost, row.currency, 0) }}
        </span>
        <div class="ml-auto mt-1.5 h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full"
            :class="burnTone(row.actual.burn)"
            :style="{ width: Math.min(100, row.actual.burn ?? 0) + '%' }"
          />
        </div>
        <span class="mt-0.5 block text-xs text-muted-foreground">
          <template v-if="row.actual.burn !== null">{{ t('finance.budgets.burned', { percent: formatPercent(row.actual.burn) }) }}</template>
          <template v-else>{{ t('finance.projects.noCostPlan') }}</template>
          · {{ t('finance.projects.labourAmount', { amount: formatMoney(row.actual.labour, row.currency, 0) }) }}
        </span>
        <span v-if="row.otherCurrencies.length > 0" class="block text-xs text-signal-foreground">
          {{ t('finance.budgets.otherCurrencies', { currencies: row.otherCurrencies.join(', ') }) }}
        </span>
      </template>
      <template #cell-collected="{ row }">
        <span class="tabular-nums">{{ formatMoney(row.actual.collected, row.currency, 0) }}</span>
        <span class="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          {{ t('finance.overview.invoicedAmount', { amount: formatMoney(row.actual.invoiced, row.currency, 0) }) }}
        </span>
      </template>
      <template #cell-margin="{ row }">
        <span class="tabular-nums" :class="(plannedMargin(row) ?? 0) < 0 ? 'text-destructive' : ''">
          {{ plannedMargin(row) === null ? '—' : formatPercent(plannedMargin(row) ?? 0) }}
        </span>
        <span
          class="mt-0.5 block text-xs tabular-nums"
          :class="actualMargin(row) < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'"
        >
          {{ t('finance.budgets.actualMargin', { amount: formatMoney(actualMargin(row), row.currency, 0) }) }}
        </span>
        <button
          type="button"
          class="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          @click="editing = row"
        >
          <Icon name="lucide:list-tree" class="size-3.5" />
          {{ t('finance.budgets.byCategory') }}{{ plannedCategories(row) > 0 ? ' (' + plannedCategories(row) + ')' : '' }}
        </button>
      </template>
      <template #cell-actions="{ row }">
        <EntityRowActions
          :name="row.project?.code ?? t('finance.budgets.entity')"
          :archivable="false"
          :can-manage="canManage"
          :busy="crud.busyId === row.id"
          @edit="crud.openEdit(row)"
          @delete="crud.askDelete(row)"
        />
      </template>
    </DataTable>

    <EntityCrudHost
      :crud="crud"
      :config="BUDGET_FORM"
      :delete-detail="t('finance.budgets.deleteDetail')"
    />

    <FinanceBudgetLines
      v-if="editing"
      :budget="editing"
      :can-manage="canManage"
      @close="editing = null"
      @saved="onLinesSaved"
    />
  </div>
</template>
