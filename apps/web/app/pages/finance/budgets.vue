<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { BUDGET_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Budgets' })

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
  project: { id: string, code: string, name: string, status: string } | null
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<BudgetRow>('/api/finance/budgets', filters as never)

const crud = useEntityCrud({
  endpoint: '/api/finance/budgets',
  refresh: () => refresh(),
  entityLabel: 'бюджет',
  nameOf: row => (row as BudgetRow).project?.code ?? 'без проекта'
})

/** Planned margin only — actual cost is derived, and lives on the overview. */
function plannedMargin(row: BudgetRow) {
  const revenue = Number(row.revenue)
  if (revenue <= 0) return null
  return Math.round(((revenue - Number(row.plannedCost)) / revenue) * 100)
}

const columns: Column[] = [
  { key: 'project', label: 'Проект', width: '34%' },
  { key: 'revenue', label: 'Плановая выручка', width: '20%', numeric: true },
  { key: 'plannedCost', label: 'Плановая себестоимость', width: '22%', numeric: true },
  { key: 'margin', label: 'Плановая маржа', width: '18%', numeric: true },
  { key: 'actions', label: '', width: '56px' }
]
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Budgets</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Бюджеты</h1>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="max-w-2xl text-sm text-muted-foreground">
          План по проекту. Факт здесь не хранится — он считается из расходов и оплаченных
          часов, и его видно в
          <NuxtLink to="/finance" class="text-foreground underline underline-offset-4">
            обзоре финансов
          </NuxtLink>.
        </p>
        <EntityToolbar :crud="crud" create-label="Новый бюджет" :can-manage="canManage" />
      </div>
    </header>

    <DataTable
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      empty-icon="lucide:calculator"
      empty-title="Пока нет бюджетов"
      empty-body="Бюджет задаёт плановую выручку и себестоимость проекта — от них считается маржа."
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
        <StatusBadge v-if="row.project" :status="row.project.status" class="ml-2 align-middle" />
      </template>
      <template #cell-revenue="{ row }">
        <span class="tabular-nums">{{ formatMoney(Number(row.revenue), row.currency) }}</span>
      </template>
      <template #cell-plannedCost="{ row }">
        <span class="tabular-nums">{{ formatMoney(Number(row.plannedCost), row.currency) }}</span>
      </template>
      <template #cell-margin="{ row }">
        <span
          v-if="plannedMargin(row) !== null"
          class="tabular-nums"
          :class="(plannedMargin(row) ?? 0) < 0 ? 'text-destructive' : ''"
        >
          {{ plannedMargin(row) }}%
        </span>
        <span v-else class="text-muted-foreground">—</span>
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
      delete-detail="Плановые цифры исчезнут, и проект будет считаться по бюджету из его карточки."
    />
  </div>
</template>
