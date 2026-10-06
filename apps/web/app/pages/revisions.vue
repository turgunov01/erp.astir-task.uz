<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource, apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { REVISION_FORM } from '~/utils/entity-forms'

const { t } = useI18n()

useHead({ title: computed(() => t('shell.nav.revisions')) })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { openTask, openEntity } = useTaskPanels()

const canUpdate = computed(() => auth.can(PERMISSION.TASK_UPDATE))
// Creating, editing and deleting a revision is a stricter right than moving
// its status along.
const canManage = computed(() => auth.can(PERMISSION.REVISION_MANAGE))

const VIEWS = [
  { key: 'open', labelKey: 'production.revisions.views.open', status: 'OPEN' },
  { key: 'in-progress', labelKey: 'production.revisions.views.inProgress', status: 'IN_PROGRESS' },
  { key: 'ready', labelKey: 'production.revisions.views.ready', status: 'READY_FOR_REVIEW' },
  { key: 'completed', labelKey: 'production.revisions.views.completed', status: 'COMPLETED' },
  { key: 'all', labelKey: 'production.revisions.views.all', status: undefined }
] as const

const view = computed(() => {
  const requested = String(route.query.view ?? 'open')
  return VIEWS.some(item => item.key === requested) ? requested : 'open'
})
const active = computed(() => VIEWS.find(item => item.key === view.value) ?? VIEWS[0])

const page = ref(Number(route.query.page ?? 1))
const projectId = ref(String(route.query.projectId ?? ''))
const busyId = ref('')
const errorMessage = ref('')

// Declared before the filters that read it; useEntityCrud receives it below.
const archivedView = ref(false)

const filters = computed(() => ({
  page: page.value,
  limit: 25,
  status: active.value.status,
  projectId: projectId.value || undefined,
  archived: archivedView.value ? 'true' : undefined
}))

function selectView(key: string) {
  page.value = 1
  router.replace({ query: key === 'open' ? {} : { view: key } })
}

interface RevisionRow {
  id: string
  round: number
  title: string
  status: string
  priority: string
  deadline: string | null
  project: { id: string, code: string } | null
  shot: { id: string, code: string } | null
  task: { id: string, title: string } | null
  requestedBy: { firstName: string, lastName: string } | null
  assignedTo: { firstName: string, lastName: string } | null
}

const { items, meta, pending, errorMessage: loadError, refresh } =
  useListResource<RevisionRow>('/api/revisions', filters as never)

const { data: countData, refresh: refreshCounts } = useFetch<{
  data: Array<{ status: string, count: number }>
}>('/api/revisions/counts', { credentials: 'include', default: () => ({ data: [] }) })

const counts = computed(() => new Map((countData.value?.data ?? []).map(r => [r.status, r.count])))

const { data: projectData } = useFetch<{ data: Array<{ id: string, code: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const projects = computed(() => projectData.value?.data ?? [])

const STATUSES = ['OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'COMPLETED', 'CANCELLED']

const crud = useEntityCrud({
  endpoint: '/api/revisions',
  refresh: () => refresh(),
  entityLabel: () => t('production.revisions.deleteEntity'),
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns = computed<Column[]>(() => [
  { key: 'title', label: t('production.revisions.columns.title'), width: '32%' },
  { key: 'round', label: t('production.revisions.columns.round'), width: '9%', numeric: true },
  { key: 'project', label: t('production.revisions.columns.project'), width: '12%' },
  { key: 'assignee', label: t('production.revisions.columns.assignee'), width: '17%' },
  { key: 'deadline', label: t('production.revisions.columns.deadline'), width: '12%' },
  { key: 'status', label: t('production.revisions.columns.status'), width: '18%' },
  { key: 'actions', label: '', width: '56px' }
])

async function changeStatus(row: RevisionRow, status: string) {
  busyId.value = row.id
  errorMessage.value = ''
  try {
    await apiRequest('/api/revisions/' + row.id, { method: 'PATCH', body: { status } })
    await Promise.all([refresh(), refreshCounts()])
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, t('production.revisions.updateFailed'))
  } finally {
    busyId.value = ''
  }
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(intlTag(), { day: '2-digit', month: 'short' }).format(new Date(value))
}

function isOverdue(row: RevisionRow) {
  return Boolean(row.deadline) &&
    new Date(row.deadline as string) < new Date() &&
    !['COMPLETED', 'CANCELLED'].includes(row.status)
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {{ t('shell.nav.production') }}
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('shell.nav.revisions') }}</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ t('production.revisions.summary', {
          open: counts.get('OPEN') ?? 0,
          inProgress: counts.get('IN_PROGRESS') ?? 0,
          completed: counts.get('COMPLETED') ?? 0
        }) }}
      </p>
    </header>

    <nav class="mb-5 flex flex-wrap gap-1.5" :aria-label="t('production.revisions.viewsLabel')">
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

    <p
      v-if="errorMessage"
      role="alert"
      class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {{ errorMessage }}
    </p>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" :create-label="t('production.revisions.createLabel')" :can-manage="canManage" />

    </div>


    <DataTable
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="loadError"
      row-clickable
      :search-placeholder="t('production.revisions.searchUnavailable')"
      empty-icon="lucide:rotate-ccw"
      :empty-title="t('production.revisions.emptyTitle')"
      :empty-body="t('production.revisions.emptyBody')"
      @update:page="page = $event"
      @retry="refresh"
      @row-click="openEntity('revision', $event.id)"
    >
      <template #toolbar>
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          :aria-label="t('production.revisions.projectFilter')"
          @change="page = 1"
        >
          <option value="">{{ t('production.revisions.allProjects') }}</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.code }}</option>
        </select>
      </template>

      <template #cell-title="{ row }">
        <p class="font-medium">{{ row.title }}</p>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <NuxtLink v-if="row.shot" :to="'/shots/' + row.shot.id" class="font-mono hover:underline">
            {{ row.shot.code }}
          </NuxtLink>
          <button
            v-if="row.task"
            type="button"
            class="hover:underline"
            @click="openTask(row.task.id)"
          >
            {{ row.task.title }}
          </button>
          <span v-if="row.requestedBy">{{ t('production.revisions.from', { name: row.requestedBy.firstName }) }}</span>
        </p>
      </template>

      <template #cell-round="{ row }">{{ row.round }}</template>

      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-assignee="{ row }">
        <span v-if="row.assignedTo">{{ row.assignedTo.firstName }} {{ row.assignedTo.lastName }}</span>
        <span v-else class="text-muted-foreground">{{ t('production.revisions.notAssigned') }}</span>
      </template>

      <template #cell-deadline="{ row }">
        <span :class="isOverdue(row) ? 'text-destructive' : ''">{{ formatDate(row.deadline) }}</span>
      </template>

      <template #cell-status="{ row }">
        <select
          v-if="canUpdate"
          :value="row.status"
          :disabled="busyId === row.id"
          class="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          :aria-label="t('production.revisions.statusOf', { title: row.title })"
          @change="changeStatus(row, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="s in STATUSES" :key="s" :value="s">{{ enumLabel(REVISION_STATUS_LABEL, s) }}</option>
        </select>
        <StatusBadge v-else :status="row.status" />
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

    <EntityCrudHost :crud="crud" :config="REVISION_FORM" />
  </div>
</template>
