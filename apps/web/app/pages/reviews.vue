<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { REVIEW_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Согласование — Aster ERP' })

const route = useRoute()
const router = useRouter()
const { openReview, setStack } = useTaskPanels()

/**
 * Views map to the URLs the spec lists for this section (21): pending,
 * internal, client, changes-requested and approved. Kept as one query param
 * so each stays a shareable link without five sibling routes.
 */
const VIEWS = [
  { key: 'pending', label: 'Ожидают', status: 'PENDING', type: undefined },
  { key: 'in-review', label: 'В работе', status: 'IN_REVIEW', type: undefined },
  { key: 'internal', label: 'Внутренние', status: undefined, type: 'INTERNAL' },
  { key: 'client', label: 'Клиентские', status: undefined, type: 'CLIENT' },
  { key: 'changes', label: 'На доработке', status: 'CHANGES_REQUESTED', type: undefined },
  { key: 'approved', label: 'Согласованы', status: 'APPROVED', type: undefined },
  { key: 'all', label: 'Все', status: undefined, type: undefined }
] as const

const view = computed(() => {
  const requested = String(route.query.view ?? 'in-review')
  return VIEWS.some(item => item.key === requested) ? requested : 'in-review'
})

const active = computed(() => VIEWS.find(item => item.key === view.value) ?? VIEWS[1])

const page = ref(Number(route.query.page ?? 1))
const projectId = ref(String(route.query.projectId ?? ''))

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.REVIEW_INTERNAL))

// Declared before the filters that read it; useEntityCrud receives it below.
const archivedView = ref(false)

const filters = computed(() => ({
  page: page.value,
  limit: 25,
  status: active.value.status,
  reviewType: active.value.type,
  projectId: projectId.value || undefined,
  archived: archivedView.value ? 'true' : undefined
}))

function selectView(key: string) {
  page.value = 1
  router.replace({ query: { ...(key === 'in-review' ? {} : { view: key }) } })
}

interface ReviewRow {
  id: string
  reviewType: string
  status: string
  createdAt: string
  completedAt: string | null
  reviewer: { firstName: string, lastName: string } | null
  version: {
    label: string
    status: string
    uploadedBy: { firstName: string, lastName: string } | null
    project: { id: string, code: string } | null
    shot: { id: string, code: string } | null
  }
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<ReviewRow>('/api/reviews', filters as never)

const { data: countData, refresh: refreshCounts } = await useFetch<{
  data: Array<{ status: string, count: number }>
}>('/api/reviews/counts', { credentials: 'include', default: () => ({ data: [] }) })

const counts = computed(() => {
  const map = new Map((countData.value?.data ?? []).map(row => [row.status, row.count]))
  return map
})

const { data: projectData } = await useFetch<{ data: Array<{ id: string, code: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const projects = computed(() => projectData.value?.data ?? [])

const crud = useEntityCrud({
  endpoint: '/api/reviews',
  refresh: () => refresh(),
  entityLabel: 'согласование',
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns: Column[] = [
  { key: 'version', label: 'Версия', width: '28%' },
  { key: 'project', label: 'Проект', width: '12%' },
  { key: 'type', label: 'Тип', width: '14%' },
  { key: 'author', label: 'Автор', width: '16%' },
  { key: 'reviewer', label: 'Проверяющий', width: '16%' },
  { key: 'status', label: 'Статус', width: '14%' },
  { key: 'actions', label: '', width: '56px' }
]

const TYPE_LABEL: Record<string, string> = {
  INTERNAL: 'Внутреннее',
  ART_DIRECTOR: 'Арт-директор',
  CLIENT: 'Клиентское',
  FINAL: 'Финальное'
}

// A ?review= link opens that review directly.
onMounted(() => {
  const deepLink = String(route.query.review ?? '')
  if (deepLink) setStack([{ kind: 'review', id: deepLink }])
})

function onChanged() {
  refresh()
  refreshCounts()
}

function daysWaiting(value: string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000)
  return days <= 0 ? 'сегодня' : days + ' дн'
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Production
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Согласование</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ counts.get('IN_REVIEW') ?? 0 }} в работе ·
        {{ counts.get('CHANGES_REQUESTED') ?? 0 }} на доработке ·
        {{ counts.get('APPROVED') ?? 0 }} согласовано
      </p>
    </header>

    <nav class="mb-5 flex flex-wrap gap-1.5" aria-label="Выборки согласования">
      <button
        v-for="item in VIEWS"
        :key="item.key"
        type="button"
        class="rounded-md px-3 py-1.5 text-sm"
        :class="view === item.key
          ? 'bg-secondary font-medium text-secondary-foreground'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'"
        @click="selectView(item.key)"
      >
        {{ item.label }}
        <span v-if="item.status" class="ml-1 tabular-nums opacity-60">
          {{ counts.get(item.status) ?? 0 }}
        </span>
      </button>
    </nav>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" create-label="На согласование" :can-manage="canManage" />

    </div>


    <DataTable
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      row-clickable
      search-placeholder="Поиск недоступен в этом разделе"
      empty-icon="lucide:eye"
      empty-title="Нет согласований"
      empty-body="Версии, отправленные на review, появятся здесь."
      @update:page="page = $event"
      @retry="refresh"
      @row-click="openReview($event.id)"
    >
      <template #toolbar>
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Фильтр по проекту"
          @change="page = 1"
        >
          <option value="">Все проекты</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.code }}</option>
        </select>
      </template>

      <template #cell-version="{ row }">
        <button
          type="button"
          class="block max-w-full truncate text-left font-mono text-sm font-medium hover:underline"
          @click="openReview(row.id)"
        >
          {{ row.version.label }}
        </button>
        <p class="mt-0.5 text-xs text-muted-foreground">
          <span v-if="row.version.shot" class="font-mono">{{ row.version.shot.code }}</span>
          <span v-if="!row.completedAt"> · ждёт {{ daysWaiting(row.createdAt) }}</span>
        </p>
      </template>

      <template #cell-project="{ row }">
        <NuxtLink
          v-if="row.version.project"
          :to="'/projects/' + row.version.project.id"
          class="hover:underline"
        >
          {{ row.version.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-type="{ row }">
        <span class="text-xs text-muted-foreground">
          {{ TYPE_LABEL[row.reviewType] ?? row.reviewType }}
        </span>
      </template>

      <template #cell-author="{ row }">
        <span v-if="row.version.uploadedBy">
          {{ row.version.uploadedBy.firstName }} {{ row.version.uploadedBy.lastName }}
        </span>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-reviewer="{ row }">
        <span v-if="row.reviewer">{{ row.reviewer.firstName }} {{ row.reviewer.lastName }}</span>
        <span v-else class="text-muted-foreground">не назначен</span>
      </template>

      <template #cell-status="{ row }">
        <StatusBadge :status="row.status" />
      </template>
          <template #cell-actions="{ row }">
        <EntityRowActions
          :archived="archivedView"
          :can-manage="canManage"
          :busy="crud.busyId === row.id"
          @edit="crud.openEdit(row)"
          @archive="crud.archive(row)"
          @unarchive="crud.unarchive(row)"
          @delete="crud.askDelete(row)"
        />
      </template>
    </DataTable>

    <EntityCrudHost :crud="crud" :config="REVIEW_FORM" />
  </div>
</template>
