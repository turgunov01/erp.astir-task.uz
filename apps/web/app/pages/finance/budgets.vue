<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { BUDGET_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Бюджеты' })

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
  entityLabel: 'бюджет',
  nameOf: row => (row as BudgetRow).project?.code ?? 'без проекта'
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

const columns: Column[] = [
  { key: 'project', label: 'Проект', width: '24%' },
  { key: 'plan', label: 'План: выручка / затраты', width: '17%', numeric: true },
  { key: 'cost', label: 'Факт затрат', width: '19%', numeric: true },
  { key: 'collected', label: 'Поступило', width: '15%', numeric: true },
  { key: 'margin', label: 'Маржа план / факт', width: '15%', numeric: true },
  { key: 'actions', label: '', width: '56px' }
]
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Финансы</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Бюджеты</h1>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="max-w-2xl text-sm text-muted-foreground">
          План проекта рядом с фактом. Факт не вводится: это расходы проекта плюс
          оплаченные по ставке часы, в валюте бюджета. Разбивка по категориям — по кнопке
          в строке; сводка по всем проектам — в
          <NuxtLink to="/finance" class="text-foreground underline underline-offset-4">
            обзоре финансов
          </NuxtLink>.
        </p>
        <EntityToolbar :crud="crud" create-label="Новый бюджет" :can-manage="canManage" />
      </div>
    </header>

    <DataTable
      :columns="columns"
      v-model:search="search"
      :rows="visible"
      search-placeholder="Проект или клиент"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      empty-icon="lucide:calculator"
      empty-title="Пока нет бюджетов"
      empty-body="Бюджет задаёт плановую выручку и себестоимость проекта — от них считается маржа и освоение."
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
          затраты {{ formatMoney(Number(row.plannedCost), row.currency, 0) }}
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
          <template v-if="row.actual.burn !== null">освоено {{ row.actual.burn }}%</template>
          <template v-else>нет плана затрат</template>
          · труд {{ formatMoney(row.actual.labour, row.currency, 0) }}
        </span>
        <span v-if="row.otherCurrencies.length > 0" class="block text-xs text-signal-foreground">
          + суммы в {{ row.otherCurrencies.join(', ') }}
        </span>
      </template>
      <template #cell-collected="{ row }">
        <span class="tabular-nums">{{ formatMoney(row.actual.collected, row.currency, 0) }}</span>
        <span class="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          выставлено {{ formatMoney(row.actual.invoiced, row.currency, 0) }}
        </span>
      </template>
      <template #cell-margin="{ row }">
        <span class="tabular-nums" :class="(plannedMargin(row) ?? 0) < 0 ? 'text-destructive' : ''">
          {{ plannedMargin(row) === null ? '—' : plannedMargin(row) + '%' }}
        </span>
        <span
          class="mt-0.5 block text-xs tabular-nums"
          :class="actualMargin(row) < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'"
        >
          факт {{ formatMoney(actualMargin(row), row.currency, 0) }}
        </span>
        <button
          type="button"
          class="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          @click="editing = row"
        >
          <Icon name="lucide:list-tree" class="size-3.5" />
          По категориям{{ plannedCategories(row) > 0 ? ' (' + plannedCategories(row) + ')' : '' }}
        </button>
      </template>
      <template #cell-actions="{ row }">
        <EntityRowActions
          :name="row.project?.code ?? 'бюджет'"
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
      delete-detail="Плановые цифры и разбивка по категориям исчезнут, и проект будет считаться по бюджету из его карточки."
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
