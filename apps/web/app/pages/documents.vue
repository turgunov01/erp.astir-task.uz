<script setup lang="ts">
import type { Column } from '~/components/DataTable.vue'
import type { MediaItem } from '~/components/media/MediaGallery.vue'
import { useListResource } from '~/composables/useApi'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { useEntityCrud } from '~/composables/useEntityCrud'
import { DOCUMENT_FORM } from '~/utils/entity-forms'
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Документы — Aster ERP' })

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

interface DocRow extends MediaItem {
  type: string
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

/** Only media rows can enter the gallery; documents open in a new tab. */
const media = computed(() =>
  items.value.filter(item => item.mimeType && /^(image|video|audio)\//.test(item.mimeType))
)

const galleryOpen = ref(false)
const galleryStart = ref(0)

function openGallery(row: DocRow) {
  const position = media.value.findIndex(item => item.id === row.id)
  if (position === -1) {
    window.open(row.fileUrl, '_blank', 'noopener')
    return
  }
  galleryStart.value = position
  galleryOpen.value = true
}

const crud = useEntityCrud({
  endpoint: '/api/files',
  refresh: () => refresh(),
  entityLabel: 'документ',
  archivedView
})

// Switching between the working set and the archive starts from page one.
watch(archivedView, () => { page.value = 1 })

const columns: Column[] = [
  { key: 'name', label: 'Файл', width: '32%' },
  { key: 'task', label: 'Задача', width: '24%' },
  { key: 'project', label: 'Проект', width: '12%' },
  { key: 'type', label: 'Тип', width: '12%' },
  { key: 'size', label: 'Размер', width: '10%', numeric: true },
  { key: 'author', label: 'Загрузил', width: '10%' },
  { key: 'actions', label: '', width: '56px' }
]

function isImage(row: DocRow) {
  return Boolean(row.mimeType?.startsWith('image/'))
}

function iconFor(row: DocRow) {
  const mime = row.mimeType ?? ''
  if (mime.startsWith('image/')) return 'lucide:image'
  if (mime.startsWith('video/')) return 'lucide:video'
  if (mime.startsWith('audio/')) return 'lucide:music'
  if (mime === 'application/pdf') return 'lucide:file-text'
  return 'lucide:file'
}

function formatSize(bytes: string | null) {
  if (!bytes) return '—'
  const value = Number(bytes)
  if (value < 1024) return value + ' B'
  if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB'
  return (value / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Библиотека
        </p>
        <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Документы и медиа</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ meta.total }} файл(ов) · {{ media.length }} медиа на странице
        </p>
      </div>
      <button
        v-if="media.length > 1"
        type="button"
        class="inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm hover:bg-secondary"
        @click="galleryOpen = true"
      >
        <Icon name="lucide:images" class="size-4" />
        Посмотреть галерею
      </button>
    </header>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">

      <EntityToolbar :crud="crud" create-label="Новый документ" :can-manage="canManage" />

    </div>


    <DataTable
      v-model:search="search"
      :columns="columns"
      :rows="items"
      :meta="meta"
      :pending="pending"
      :error-message="errorMessage"
      search-placeholder="Поиск по названию файла..."
      empty-icon="lucide:folder"
      empty-title="Файлов пока нет"
      empty-body="Прикрепите файлы к задаче или проекту — они появятся здесь."
      @update:page="page = $event"
      @update:search="page = 1"
      @retry="refresh"
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
        <label class="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input v-model="mediaOnly" type="checkbox" class="size-4 accent-primary" @change="page = 1">
          Только медиа
        </label>
      </template>

      <template #cell-name="{ row }">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 text-left"
          :aria-label="'Открыть ' + row.name"
          @click="openGallery(row)"
        >
          <span class="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary">
            <img
              v-if="isImage(row)"
              :src="row.fileUrl"
              :alt="row.name"
              loading="lazy"
              class="size-full object-cover"
            >
            <Icon v-else :name="iconFor(row)" class="size-4 text-muted-foreground" />
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
        <span v-else class="text-muted-foreground">не привязан</span>
      </template>

      <template #cell-project="{ row }">
        <NuxtLink v-if="row.project" :to="'/projects/' + row.project.id" class="hover:underline">
          {{ row.project.code }}
        </NuxtLink>
        <span v-else class="text-muted-foreground">—</span>
      </template>

      <template #cell-type="{ row }">
        <span class="text-xs text-muted-foreground">{{ row.type }}</span>
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

    <MediaGallery
      v-if="galleryOpen && media.length > 0"
      :items="media"
      :start-index="galleryStart"
      @close="galleryOpen = false"
    />
  </div>
</template>
