<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import type { DocumentLike } from '~/utils/media'
import { useListResource } from '~/composables/useApi'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { DOCUMENT_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

const { t } = useI18n()

useHead({ title: computed(() => t('projects.documents.headTitle')) })

const route = useRoute()
const { openTask } = useTaskPanels()

const page = ref(Number(route.query.page ?? 1))
const search = ref('')
const projectId = ref(String(route.query.projectId ?? ''))
const mediaOnly = ref(false)

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.DOCUMENT_MANAGE))

// Declared before the filters that read it; useEntityCrud receives it below.
const archivedView = ref(false)

const filters = computed(() => ({
  page: page.value,
  limit: 25,
  search: search.value || undefined,
  projectId: projectId.value || undefined,
  mediaOnly: mediaOnly.value || undefined,
  archived: archivedView.value ? 'true' : undefined
}))

interface DocRow extends DocumentLike {
  type: string
  fileSize: string | null
  createdAt: string
  task: { id: string, title: string, status: string } | null
  project: { id: string, code: string } | null
  uploadedBy: { firstName: string, lastName: string } | null
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<DocRow>('/api/files', filters as never)

const { data: projectData } = await useFetch<{ data: Array<{ id: string, code: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const projects = computed(() => projectData.value?.data ?? [])

const media = computed(() =>
  items.value.filter(item => ['image', 'video', 'audio'].includes(mediaKind(item.mimeType, item.name)))
)

const viewer = useMediaViewer()

/** A row opens in the viewer with the rest of the page a swipe away. */
function openRow(row: DocRow) {
  viewer.open(items.value.map(documentToViewerItem), row.id)
}

/** The header button pages through pictures, clips and sound only. */
function openGallery() {
  viewer.open(media.value.map(documentToViewerItem))
}

const crud = useEntityCrud({
  endpoint: '/api/files',
  refresh: () => refresh(),
  get entityLabel() { return t('projects.documents.entity') },
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns = computed<Column[]>(() => [
  { key: 'name', label: t('projects.documents.columns.name'), width: '32%' },
  { key: 'task', label: t('projects.documents.columns.task'), width: '24%' },
  { key: 'project', label: t('projects.list.columns.name'), width: '12%' },
  { key: 'type', label: t('projects.form.type'), width: '12%' },
  { key: 'size', label: t('projects.documents.columns.size'), width: '10%', numeric: true },
  { key: 'author', label: t('projects.documents.columns.author'), width: '10%' },
  { key: 'actions', label: '', width: '56px' }
])

function formatSize(bytes: string | null) {
  return formatBytes(bytes) || '—'
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('projects.documents.eyebrow') }}
        </p>
        <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('projects.documents.title') }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ countLabel(meta.total, 'projects.count.files') }} · {{ t('projects.documents.mediaOnPage', { n: media.length }) }}
        </p>
      </div>
      <button
        v-if="media.length > 1"
        type="button"
        class="inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm hover:bg-secondary"
        @click="openGallery"
      >
        <Icon name="lucide:images" class="size-4" />
        {{ t('projects.documents.gallery') }}
      </button>
    </header>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" :create-label="t('projects.documents.newDocument')" :can-manage="canManage" />

    </div>


    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      :search-placeholder="t('projects.documents.searchPlaceholder')"
      empty-icon="lucide:folder"
      :empty-title="t('projects.files.emptyTitle')"
      :empty-body="t('projects.documents.emptyBody')"
      @update:page="page = $event"
      @update:search="page = 1"
      @retry="refresh"
    >
      <template #toolbar>
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          :aria-label="t('projects.documents.projectFilter')"
          @change="page = 1"
        >
          <option value="">{{ t('projects.documents.allProjects') }}</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.code }}</option>
        </select>
        <label class="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input v-model="mediaOnly" type="checkbox" class="size-4 accent-primary" @change="page = 1">
          {{ t('projects.documents.mediaOnly') }}
        </label>
      </template>

      <template #cell-name="{ row }">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 text-left"
          :aria-label="t('projects.files.openOf', { name: row.name })"
          @click="openRow(row)"
        >
          <span class="block size-9 shrink-0 overflow-hidden rounded-md bg-secondary">
            <MediaThumb :item="documentToViewerItem(row)" icon-class="size-4" :show-badge="false" />
          </span>
          <span class="min-w-0 truncate font-medium hover:underline">{{ row.name }}</span>
        </button>
      </template>

      <template #cell-task="{ row }">
        <button
          v-if="row.task"
          type="button"
          class="max-w-full truncate text-left hover:underline"
          @click="openTask(row.task.id)"
        >
          {{ row.task.title }}
        </button>
        <span v-else class="text-muted-foreground">{{ t('projects.documents.notLinked') }}</span>
      </template>

      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-type="{ row }">
        <span class="text-xs text-muted-foreground">{{ labelOf(DOCUMENT_TYPE_LABEL, row.type) }}</span>
      </template>

      <template #cell-size="{ row }">
        <span class="text-xs tabular-nums text-muted-foreground">{{ formatSize(row.fileSize) }}</span>
      </template>

      <template #cell-author="{ row }">
        <span v-if="row.uploadedBy" class="text-xs">{{ row.uploadedBy.firstName }}</span>
        <span v-else class="text-xs text-muted-foreground">—</span>
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

    <EntityCrudHost :crud="crud" :config="DOCUMENT_FORM" />
  </div>
</template>
