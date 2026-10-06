<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource } from '~/composables/useApi'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { REVIEW_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

const { t } = useI18n()

useHead({ title: computed(() => t('shell.nav.reviews')) })

const route = useRoute()
const router = useRouter()
const { openReview, setStack } = useTaskPanels()

/**
 * Views map to the URLs the spec lists for this section (21): pending,
 * internal, client, changes-requested and approved. Kept as one query param
 * so each stays a shareable link without five sibling routes.
 */
const VIEWS = [
  { key: 'pending', labelKey: 'production.reviews.views.pending', status: 'PENDING', type: undefined },
  { key: 'in-review', labelKey: 'production.reviews.views.inReview', status: 'IN_REVIEW', type: undefined },
  { key: 'internal', labelKey: 'production.reviews.views.internal', status: undefined, type: 'INTERNAL' },
  { key: 'client', labelKey: 'production.reviews.views.client', status: undefined, type: 'CLIENT' },
  { key: 'changes', labelKey: 'production.reviews.views.changes', status: 'CHANGES_REQUESTED', type: undefined },
  { key: 'approved', labelKey: 'production.reviews.views.approved', status: 'APPROVED', type: undefined },
  { key: 'all', labelKey: 'production.reviews.views.all', status: undefined, type: undefined }
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

const { data: countData, refresh: refreshCounts } = useFetch<{
  data: Array<{ status: string, count: number }>
}>('/api/reviews/counts', { credentials: 'include', default: () => ({ data: [] }) })

const counts = computed(() => {
  const map = new Map((countData.value?.data ?? []).map(row => [row.status, row.count]))
  return map
})

const { data: projectData } = useFetch<{ data: Array<{ id: string, code: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const projects = computed(() => projectData.value?.data ?? [])

const crud = useEntityCrud({
  endpoint: '/api/reviews',
  refresh: () => refresh(),
  entityLabel: () => t('production.reviews.deleteEntity'),
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns = computed<Column[]>(() => [
  { key: 'version', label: t('production.reviews.columns.version'), width: '28%' },
  { key: 'project', label: t('production.reviews.columns.project'), width: '12%' },
  { key: 'type', label: t('production.reviews.columns.type'), width: '14%' },
  { key: 'author', label: t('production.reviews.columns.author'), width: '16%' },
  { key: 'reviewer', label: t('production.reviews.columns.reviewer'), width: '16%' },
  { key: 'status', label: t('production.reviews.columns.status'), width: '14%' },
  { key: 'actions', label: '', width: '56px' }
])

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
  return days <= 0
    ? t('production.reviews.waitingToday')
    : t('production.reviews.waitingDays', { n: days })
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {{ t('shell.nav.production') }}
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('shell.nav.reviews') }}</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ t('production.reviews.summary', {
          inReview: counts.get('IN_REVIEW') ?? 0,
          changes: counts.get('CHANGES_REQUESTED') ?? 0,
          approved: counts.get('APPROVED') ?? 0
        }) }}
      </p>
    </header>

    <nav class="mb-5 flex flex-wrap gap-1.5" :aria-label="t('production.reviews.viewsLabel')">
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
        {{ t(item.labelKey) }}
        <span v-if="item.status" class="ml-1 tabular-nums opacity-60">
          {{ counts.get(item.status) ?? 0 }}
        </span>
      </button>
    </nav>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" :create-label="t('production.reviews.createLabel')" :can-manage="canManage" />

    </div>


    <DataTable
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      row-clickable
      :search-placeholder="t('production.reviews.searchUnavailable')"
      empty-icon="lucide:eye"
      :empty-title="t('production.reviews.emptyTitle')"
      :empty-body="t('production.reviews.emptyBody')"
      @update:page="page = $event"
      @retry="refresh"
      @row-click="openReview($event.id)"
    >
      <template #toolbar>
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          :aria-label="t('production.reviews.projectFilter')"
          @change="page = 1"
        >
          <option value="">{{ t('production.reviews.allProjects') }}</option>
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
          <span v-if="!row.completedAt"> · {{ daysWaiting(row.createdAt) }}</span>
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
          {{ labelOf(REVIEW_TYPE_LABEL, row.reviewType) }}
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
        <span v-else class="text-muted-foreground">{{ t('production.reviews.notAssigned') }}</span>
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
