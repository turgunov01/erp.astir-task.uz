<script setup lang="ts">
import { useFilterOptions } from '~/composables/useFilterOptions'
import { printReport, reportCsvHref } from '~/composables/useReport'

useHead({ title: 'Production report — Aster ERP' })

const route = useRoute()
const router = useRouter()
const projectId = ref(String(route.query.projectId ?? ''))

watch(projectId, value => {
  router.replace({ query: { ...route.query, projectId: value || undefined } })
})

const projectOptions = useFilterOptions<{ id: string, code: string, name: string }>(
  '/api/projects',
  row => row.code + ' · ' + row.name
)

interface ProductionRow {
  id: string
  code: string
  name: string
  status: string
  risk: string
  progress: number
  deadline: string | null
  late: boolean
  stagesTotal: number
  stagesDone: number
  tasksTotal: number
  tasksDone: number
  tasksOverdue: number
  revisionsOpen: number
}

const { data, pending, error, refresh } = await useFetch<{ data: ProductionRow[] }>(
  '/api/reports/production',
  {
    query: computed(() => ({ projectId: projectId.value || undefined })),
    credentials: 'include',
    default: () => ({ data: [] })
  }
)

const rows = computed(() => data.value?.data ?? [])

const totals = computed(() => ({
  projects: rows.value.length,
  late: rows.value.filter(row => row.late).length,
  overdue: rows.value.reduce((sum, row) => sum + row.tasksOverdue, 0),
  revisions: rows.value.reduce((sum, row) => sum + row.revisionsOpen, 0)
}))

const csvHref = computed(() =>
  reportCsvHref('/api/reports/production', { projectId: projectId.value || undefined })
)
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Reports</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Производство</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        Состояние живых проектов: прогресс, сорванные сроки и открытые правки.
        Отменённые и архивные проекты в отчёт не входят.
      </p>

      <div class="mt-4 flex flex-wrap items-center gap-2 print:hidden">
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

        <span class="flex-1" />

        <a
          :href="csvHref"
          class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-secondary"
        >
          <Icon name="lucide:download" class="size-4" />
          CSV
        </a>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-secondary"
          @click="printReport()"
        >
          <Icon name="lucide:printer" class="size-4" />
          Печать
        </button>
      </div>
    </header>

    <div
      v-if="error"
      class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center"
    >
      <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
      <p class="mt-3 text-sm">Не удалось построить отчёт</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <div v-else-if="pending && rows.length === 0" class="space-y-3">
      <div v-for="n in 5" :key="n" class="h-10 rounded-lg bg-muted" />
    </div>

    <p
      v-else-if="rows.length === 0"
      class="rounded-xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground"
    >
      Живых проектов нет — отчёту не о чем рассказать.
    </p>

    <template v-else>
      <div class="mb-4 grid gap-3 sm:grid-cols-4">
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">Проектов</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ totals.projects }}</p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">Сорван срок</p>
          <p
            class="mt-1 text-xl font-semibold tabular-nums"
            :class="totals.late > 0 ? 'text-destructive' : ''"
          >
            {{ totals.late }}
          </p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">Просроченных задач</p>
          <p
            class="mt-1 text-xl font-semibold tabular-nums"
            :class="totals.overdue > 0 ? 'text-destructive' : ''"
          >
            {{ totals.overdue }}
          </p>
        </div>
        <div class="rounded-xl border bg-card px-4 py-3">
          <p class="text-xs text-muted-foreground">Открытых правок</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ totals.revisions }}</p>
        </div>
      </div>

      <div class="overflow-x-auto rounded-xl border bg-card">
        <table class="w-full text-sm">
          <thead class="border-b bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th class="px-5 py-2.5 font-medium">Проект</th>
              <th class="px-5 py-2.5 font-medium">Статус</th>
              <th class="px-5 py-2.5 font-medium">Риск</th>
              <th class="px-5 py-2.5 text-right font-medium">Прогресс</th>
              <th class="px-5 py-2.5 font-medium">Дедлайн</th>
              <th class="px-5 py-2.5 text-right font-medium">Этапы</th>
              <th class="px-5 py-2.5 text-right font-medium">Задачи</th>
              <th class="px-5 py-2.5 text-right font-medium">Просрочено</th>
              <th class="px-5 py-2.5 text-right font-medium">Правки</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-b last:border-0">
              <td class="px-5 py-3">
                <NuxtLink :to="'/projects/' + row.id" class="font-medium hover:underline">
                  {{ row.code }}
                </NuxtLink>
                <span class="ml-2 text-muted-foreground">{{ row.name }}</span>
              </td>
              <td class="px-5 py-3"><StatusBadge :status="row.status" /></td>
              <td class="px-5 py-3"><StatusBadge :status="row.risk" kind="risk" /></td>
              <td class="px-5 py-3 text-right tabular-nums">{{ row.progress }}%</td>
              <td class="px-5 py-3" :class="row.late ? 'text-destructive' : ''">
                {{ formatDay(row.deadline) }}
              </td>
              <td class="px-5 py-3 text-right tabular-nums">
                {{ row.stagesDone }} / {{ row.stagesTotal }}
              </td>
              <td class="px-5 py-3 text-right tabular-nums">
                {{ row.tasksDone }} / {{ row.tasksTotal }}
              </td>
              <td
                class="px-5 py-3 text-right tabular-nums"
                :class="row.tasksOverdue > 0 ? 'text-destructive' : 'text-muted-foreground'"
              >
                {{ row.tasksOverdue }}
              </td>
              <td class="px-5 py-3 text-right tabular-nums text-muted-foreground">
                {{ row.revisionsOpen }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
