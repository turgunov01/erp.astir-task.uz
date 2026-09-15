<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { useFilterOptions } from '~/composables/useFilterOptions'
import { EXPENSE_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Expenses — Aster ERP' })

const route = useRoute()
const page = ref(Number(route.query.page ?? 1))
const projectId = ref(String(route.query.projectId ?? ''))
const category = ref(String(route.query.category ?? ''))

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.FINANCE_MANAGE))

const projectOptions = useFilterOptions<{ id: string, code: string, name: string }>(
  '/api/projects',
  row => row.code + ' · ' + row.name
)

const filters = computed(() => ({
  page: page.value,
  limit: 20,
  projectId: projectId.value || undefined,
  category: category.value || undefined
}))

interface ExpenseRow {
  id: string
  category: string
  description: string | null
  amount: string
  currency: string
  date: string
  project: { id: string, code: string } | null
  createdBy: { firstName: string, lastName: string } | null
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<ExpenseRow>('/api/finance/expenses', filters as never)

/** Narrowing a filter re-reads from page one, or the table looks empty. */
watch([projectId, category], () => { page.value = 1 })

const crud = useEntityCrud({
  endpoint: '/api/finance/expenses',
  refresh: () => refresh(),
  entityLabel: 'расход',
  // An expense has no name column, and a uuid in the delete dialog tells
  // nobody which of four render invoices they are about to remove.
  nameOf: row => describe(row as ExpenseRow)
})

function describe(row: ExpenseRow) {
  return enumLabel(EXPENSE_CATEGORY_LABEL, row.category) +
    ' · ' + formatMoney(Number(row.amount), row.currency)
}

const pageTotal = computed(() =>
  items.value.reduce((sum, row) => sum + Number(row.amount), 0)
)

/*
 * A total is only honest while one currency is on screen. Mixed rows get no
 * number rather than one that quietly adds dollars to som.
 */
const currencies = computed(() => new Set(items.value.map(row => row.currency)))

const columns: Column[] = [
  { key: 'date', label: 'Дата', width: '13%' },
  { key: 'project', label: 'Проект', width: '13%' },
  { key: 'category', label: 'Категория', width: '14%' },
  { key: 'description', label: 'Описание', width: '28%' },
  { key: 'amount', label: 'Сумма', width: '14%', numeric: true },
  { key: 'author', label: 'Внёс', width: '14%' },
  { key: 'actions', label: '', width: '56px' }
]
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Expenses</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Расходы</h1>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">
          {{ meta.total }} записей<template v-if="items.length > 0 && currencies.size === 1">
            · на странице {{ formatMoney(pageTotal, items[0]?.currency) }}
          </template>
        </p>
        <EntityToolbar :crud="crud" create-label="Новый расход" :can-manage="canManage" />
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Проект"
        >
          <option value="">Все проекты</option>
          <option v-for="option in projectOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>

        <select
          v-model="category"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Категория"
        >
          <option value="">Все категории</option>
          <option v-for="(label, value) in EXPENSE_CATEGORY_LABEL" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </div>
    </header>

    <DataTable
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      empty-icon="lucide:receipt"
      empty-title="Пока нет расходов"
      empty-body="Расход уменьшает прибыль проекта и попадает в его фактическую себестоимость."
      @update:page="page = $event"
      @retry="refresh"
    >
      <template #cell-date="{ row }">{{ formatDay(row.date) }}</template>
      <template #cell-project="{ row }">
        <NuxtLink
          v-if="row.project"
          :to="'/projects/' + row.project.id"
          class="hover:underline"
        >
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>
      <template #cell-category="{ row }">
        {{ enumLabel(EXPENSE_CATEGORY_LABEL, row.category) }}
      </template>
      <template #cell-description="{ row }">
        <span v-if="row.description">{{ row.description }}</span>
        <span v-else class="text-muted-foreground">—</span>
      </template>
      <template #cell-amount="{ row }">
        <span class="tabular-nums">{{ formatMoney(Number(row.amount), row.currency) }}</span>
      </template>
      <template #cell-author="{ row }">
        <span class="text-muted-foreground">{{ fullName(row.createdBy) }}</span>
      </template>
      <template #cell-actions="{ row }">
        <EntityRowActions
          :name="describe(row)"
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
      :config="EXPENSE_FORM"
      delete-detail="Запись исчезнет из списков и из фактической себестоимости проекта."
    />
  </div>
</template>
