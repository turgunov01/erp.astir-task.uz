<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import { useListResource, apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { PERMISSION, RENDER_STATUS } from '@astir/types'
import { useAuthStore } from '~/stores/auth'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { RENDER_FORM } from '~/utils/entity-forms'

useHead({ title: 'Очередь рендера — Aster ERP' })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.RENDER_MANAGE))
const { openEntity } = useTaskPanels()

const VIEWS = [
  { key: 'queue', label: 'В очереди', status: 'QUEUED' },
  { key: 'running', label: 'Рендерится', status: 'RENDERING' },
  { key: 'completed', label: 'Готово', status: 'COMPLETED' },
  { key: 'failed', label: 'Ошибки', status: 'FAILED' },
  { key: 'all', label: 'Все', status: undefined }
] as const

const view = computed(() => {
  const requested = String(route.query.view ?? 'all')
  return VIEWS.some(item => item.key === requested) ? requested : 'all'
})
const active = computed(() => VIEWS.find(item => item.key === view.value) ?? VIEWS[4])

const page = ref(1)
const busyId = ref('')
const errorMessage = ref('')

// Declared before the filters that read it; useEntityCrud receives it below.
const archivedView = ref(false)

const filters = computed(() => ({
  page: page.value,
  limit: 25,
  status: active.value.status,
  archived: archivedView.value ? 'true' : undefined
}))

function selectView(key: string) {
  page.value = 1
  router.replace({ query: key === 'all' ? {} : { view: key } })
}

interface JobRow {
  id: string
  status: string
  progress: number
  priority: string
  startFrame: number | null
  endFrame: number | null
  errorMessage: string | null
  project: { id: string, code: string } | null
  shot: { id: string, code: string } | null
  node: { id: string, name: string, isOnline: boolean } | null
  submittedBy: { firstName: string, lastName: string } | null
}

const { items, meta, pending, errorMessage: loadError, refresh } =
  useListResource<JobRow>('/api/render', filters as never)

const { data: countData, refresh: refreshCounts } = await useFetch<{
  data: Array<{ status: string, count: number }>
}>('/api/render/counts', { credentials: 'include', default: () => ({ data: [] }) })

const { data: nodeData } = await useFetch<{
  data: Array<{ id: string, name: string, isOnline: boolean, _count: { jobs: number } }>
}>('/api/render/nodes', { credentials: 'include', default: () => ({ data: [] }) })

const counts = computed(() => new Map((countData.value?.data ?? []).map(r => [r.status, r.count])))
const nodes = computed(() => nodeData.value?.data ?? [])

const STATUSES = Object.values(RENDER_STATUS)

const crud = useEntityCrud({
  endpoint: '/api/render',
  refresh: () => refresh(),
  entityLabel: 'задание',
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns: Column[] = [
  { key: 'shot', label: 'Шот', width: '20%' },
  { key: 'project', label: 'Проект', width: '12%' },
  { key: 'frames', label: 'Кадры', width: '16%' },
  { key: 'node', label: 'Узел', width: '14%' },
  { key: 'progress', label: 'Прогресс', width: '20%' },
  { key: 'status', label: 'Статус', width: '18%' },
  { key: 'actions', label: '', width: '56px' }
]

async function changeStatus(row: JobRow, status: string) {
  busyId.value = row.id
  errorMessage.value = ''
  try {
    await apiRequest('/api/render/' + row.id, { method: 'PATCH', body: { status } })
    await Promise.all([refresh(), refreshCounts()])
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось обновить задание')
  } finally {
    busyId.value = ''
  }
}

function frames(row: JobRow) {
  if (row.startFrame == null || row.endFrame == null) return '—'
  return row.startFrame + '–' + row.endFrame + ' (' + (row.endFrame - row.startFrame + 1) + ')'
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Production
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Очередь рендера</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ counts.get('QUEUED') ?? 0 }} в очереди ·
        {{ counts.get('RENDERING') ?? 0 }} рендерится ·
        <span :class="(counts.get('FAILED') ?? 0) > 0 ? 'text-destructive' : ''">
          {{ counts.get('FAILED') ?? 0 }} с ошибкой
        </span>
      </p>
    </header>

    <section class="mb-6 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="node in nodes" :key="node.id" class="bg-card px-4 py-3">
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-sm font-medium">{{ node.name }}</p>
          <span
            class="size-2 shrink-0 rounded-full"
            :class="node.isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
          />
        </div>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ node._count.jobs }} заданий · {{ node.isOnline ? 'в сети' : 'не в сети' }}
        </p>
      </div>
    </section>

    <nav class="mb-5 flex flex-wrap gap-1.5" aria-label="Выборки рендера">
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

    <p
      v-if="errorMessage"
      role="alert"
      class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {{ errorMessage }}
    </p>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" create-label="Новое задание" :can-manage="canManage" />

    </div>


    <DataTable
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="loadError"
      row-clickable
      search-placeholder="Поиск недоступен в этом разделе"
      empty-icon="lucide:server"
      empty-title="Очередь пуста"
      empty-body="Задания появятся после отправки шотов на рендер."
      @update:page="page = $event"
      @retry="refresh"
      @row-click="openEntity('render', $event.id)"
    >
      <template #cell-shot="{ row }">
        <NuxtLink v-if="row.shot" :to="'/shots/' + row.shot.id" class="font-mono text-sm hover:underline">
          {{ row.shot.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
        <p v-if="row.errorMessage" class="mt-0.5 truncate text-xs text-destructive">
          {{ row.errorMessage }}
        </p>
      </template>

      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-frames="{ row }">
        <span class="text-xs tabular-nums text-muted-foreground">{{ frames(row) }}</span>
      </template>

      <template #cell-node="{ row }">
        <span v-if="row.node" class="text-xs">{{ row.node.name }}</span>
        <span v-else class="text-xs text-muted-foreground">не назначен</span>
      </template>

      <template #cell-progress="{ row }"><ProgressBar :value="row.progress" /></template>

      <template #cell-status="{ row }">
        <select
          v-if="canManage"
          :value="row.status"
          :disabled="busyId === row.id"
          class="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          aria-label="Статус задания"
          @change="changeStatus(row, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="s in STATUSES" :key="s" :value="s">{{ enumLabel(RENDER_STATUS_LABEL, s) }}</option>
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

    <EntityCrudHost :crud="crud" :config="RENDER_FORM" />
  </div>
</template>
