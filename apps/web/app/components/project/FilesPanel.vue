<script setup lang="ts">
import { PERMISSION, DOCUMENT_TYPE, UPLOAD_KIND } from '@astir/types'
import { apiErrorMessage } from '~/composables/useApi'
import { isUploadCancelled, useChunkedUpload } from '~/composables/useChunkedUpload'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { DOCUMENT_TYPE_LABEL, labelOf } from '~/utils/labels'
import { formatBytes } from '~/utils/media'

interface Doc {
  id: string
  name: string
  type: string
  fileUrl: string
  fileSize: string | null
  mimeType: string | null
  createdAt: string
  uploadedBy: { firstName: string, lastName: string } | null
}

const props = defineProps<{ projectId: string }>()

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.DOCUMENT_MANAGE))

const { data, pending, error, refresh } = await useFetch<{ data: Doc[] }>('/api/files', {
  query: { projectId: props.projectId, limit: 100 },
  credentials: 'include',
  default: () => ({ data: [] })
})

const files = computed(() => data.value?.data ?? [])

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const errorMessage = ref('')
const docType = ref<string>(DOCUMENT_TYPE.OTHER)
const dragging = ref(false)

const TYPES = Object.values(DOCUMENT_TYPE)

const viewer = useMediaViewer()

/** Any file opens in the viewer, with the rest of the project's files beside it. */
function openFile(doc: Doc) {
  viewer.open(files.value.map(documentToViewerItem), doc.id)
}

function formatSize(bytes: string | null) {
  return formatBytes(bytes)
}

const {
  progress: uploadProgress,
  fileName: uploadingName,
  upload,
  cancel: cancelUpload
} = useChunkedUpload()
/** Position in a multi-file batch, for "2 of 5". */
const batch = ref({ current: 0, total: 0 })

/**
 * Files go up one at a time in chunks, so a large video survives a flaky
 * connection and the bar can show real progress. A failure or a cancel stops
 * the batch; whatever finished before it stays uploaded.
 */
async function uploadFiles(list: FileList | null) {
  // One batch at a time: a second drop would share the uploader in flight.
  if (!list || list.length === 0 || uploading.value) return
  const chosen = Array.from(list)
  errorMessage.value = ''
  uploading.value = true
  let uploaded = 0
  try {
    for (const [position, file] of chosen.entries()) {
      batch.value = { current: position + 1, total: chosen.length }
      await upload(file, {
        kind: UPLOAD_KIND.DOCUMENT,
        fields: { projectId: props.projectId, type: docType.value }
      })
      uploaded += 1
    }
  } catch (err) {
    if (!isUploadCancelled(err)) {
      errorMessage.value = apiErrorMessage(err, 'Не удалось загрузить файл')
    }
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
    if (uploaded > 0) await refresh()
  }
}

async function removeFile(doc: Doc) {
  errorMessage.value = ''
  try {
    await $fetch('/api/files/' + doc.id, { method: 'DELETE', credentials: 'include' })
    await refresh()
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось удалить файл')
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  uploadFiles(event.dataTransfer?.files ?? null)
}
</script>

<template>
  <section class="rounded-xl border bg-card">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div>
        <h2 class="text-sm font-medium">Файлы и медиа</h2>
        <p class="mt-1 text-xs text-muted-foreground">{{ countLabel(files.length, 'файл', 'файла', 'файлов') }}</p>
      </div>
      <select
        v-if="canManage"
        v-model="docType"
        class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
        aria-label="Тип документа"
      >
        <option v-for="t in TYPES" :key="t" :value="t">{{ labelOf(DOCUMENT_TYPE_LABEL, t) }}</option>
      </select>
    </header>

    <p
      v-if="errorMessage"
      role="alert"
      class="border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive"
    >
      {{ errorMessage }}
    </p>

    <div
      v-if="canManage"
      class="border-b px-5 py-5"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <div
        class="grid place-items-center rounded-lg border-2 border-dashed px-6 py-8 text-center"
        :class="dragging ? 'border-primary bg-primary/5' : 'border-border'"
      >
        <Icon name="lucide:upload-cloud" class="size-7 text-muted-foreground/60" />
        <p class="mt-3 text-sm font-medium">
          {{ uploading ? 'Загрузка...' : 'Перетащите файлы сюда' }}
        </p>
        <p class="mt-1 text-xs text-muted-foreground">
          Изображения, видео, аудио, PDF и документы. До 1 ГБ.
        </p>
        <div
          v-if="uploading"
          class="mt-4 w-full max-w-sm text-left"
          aria-live="polite"
        >
          <p class="flex items-baseline justify-between gap-3 text-xs">
            <span class="min-w-0 truncate font-medium">{{ uploadingName }}</span>
            <span v-if="batch.total > 1" class="shrink-0 text-muted-foreground">
              {{ batch.current }} из {{ batch.total }}
            </span>
          </p>
          <ProgressBar :value="uploadProgress" fluid class="mt-1.5" />
          <button
            type="button"
            class="mt-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-destructive"
            @click="cancelUpload()"
          >
            Отменить загрузку
          </button>
        </div>
        <input
          ref="fileInput"
          type="file"
          multiple
          class="sr-only"
          @change="uploadFiles(($event.target as HTMLInputElement).files)"
        >
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="mt-4"
          :disabled="uploading"
          @click="fileInput?.click()"
        >
          Выбрать файлы
        </Button>
      </div>
    </div>

    <div v-if="error" class="px-5 py-14 text-center">
      <p class="text-sm text-muted-foreground">Не удалось загрузить список файлов</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <div v-else-if="pending && files.length === 0" class="grid gap-4 px-5 py-5 sm:grid-cols-3">
      <div v-for="n in 3" :key="n" class="h-28 rounded-lg bg-muted" />
    </div>

    <div v-else-if="files.length === 0" class="grid place-items-center px-6 py-14 text-center">
      <Icon name="lucide:folder-open" class="size-7 text-muted-foreground/50" />
      <h3 class="mt-3 text-sm font-medium">Файлов пока нет</h3>
      <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Прикрепите брифы, референсы, превью и договоры к проекту.
      </p>
    </div>

    <ul v-else class="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="doc in files"
        :key="doc.id"
        class="group overflow-hidden rounded-lg border bg-background"
      >
        <button
          type="button"
          class="block h-32 w-full bg-muted/40 transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring motion-reduce:transition-none"
          tabindex="-1"
          :aria-label="'Просмотр ' + doc.name"
          @click="openFile(doc)"
        >
          <MediaThumb :item="documentToViewerItem(doc)" icon-class="size-8 text-muted-foreground/60" />
        </button>

        <div class="flex items-start justify-between gap-2 px-3 py-2.5">
          <div class="min-w-0">
            <button
              type="button"
              class="block max-w-full truncate text-left text-sm font-medium hover:underline"
              :aria-label="'Открыть ' + doc.name"
              @click="openFile(doc)"
            >
              {{ doc.name }}
            </button>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ labelOf(DOCUMENT_TYPE_LABEL, doc.type) }}<template v-if="formatSize(doc.fileSize)"> · {{ formatSize(doc.fileSize) }}</template>
            </p>
          </div>
          <button
            v-if="canManage"
            type="button"
            class="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 hover:bg-secondary hover:text-destructive focus:opacity-100 group-hover:opacity-100"
            :aria-label="'Удалить ' + doc.name"
            @click="removeFile(doc)"
          >
            <Icon name="lucide:trash-2" class="size-3.5" />
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
