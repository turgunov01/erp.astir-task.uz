<script setup lang="ts">
import { PERMISSION, DOCUMENT_TYPE } from '@astir/types'
import { apiErrorMessage } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'

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

function isImage(doc: Doc) {
  return Boolean(doc.mimeType && doc.mimeType.startsWith('image/'))
}

function isVideo(doc: Doc) {
  return Boolean(doc.mimeType && doc.mimeType.startsWith('video/'))
}

function iconFor(doc: Doc) {
  if (isImage(doc)) return 'lucide:image'
  if (isVideo(doc)) return 'lucide:video'
  if (doc.mimeType === 'application/pdf') return 'lucide:file-text'
  return 'lucide:file'
}

function formatSize(bytes: string | null) {
  if (!bytes) return ''
  const value = Number(bytes)
  if (value < 1024) return value + ' B'
  if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB'
  return (value / (1024 * 1024)).toFixed(1) + ' MB'
}

/** Uploads go through FormData, so no JSON body and no manual content-type. */
async function uploadFiles(list: FileList | null) {
  if (!list || list.length === 0) return
  errorMessage.value = ''
  uploading.value = true
  try {
    for (const file of Array.from(list)) {
      const body = new FormData()
      body.append('file', file)
      body.append('projectId', props.projectId)
      body.append('type', docType.value)
      await $fetch('/api/files', { method: 'POST', body, credentials: 'include' })
    }
    await refresh()
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось загрузить файл')
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
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
        <p class="mt-1 text-xs text-muted-foreground">{{ files.length }} файл(ов)</p>
      </div>
      <select
        v-if="canManage"
        v-model="docType"
        class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
        aria-label="Тип документа"
      >
        <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
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
          Изображения, видео, аудио, PDF и документы. До 200 МБ.
        </p>
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
        <div class="grid h-32 place-items-center bg-muted/40">
          <img
            v-if="isImage(doc)"
            :src="doc.fileUrl"
            :alt="doc.name"
            loading="lazy"
            class="size-full object-cover"
          >
          <video v-else-if="isVideo(doc)" :src="doc.fileUrl" class="size-full object-cover" muted />
          <Icon v-else :name="iconFor(doc)" class="size-8 text-muted-foreground/60" />
        </div>

        <div class="flex items-start justify-between gap-2 px-3 py-2.5">
          <div class="min-w-0">
            <a
              :href="doc.fileUrl"
              target="_blank"
              rel="noopener"
              class="block truncate text-sm font-medium hover:underline"
            >
              {{ doc.name }}
            </a>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ doc.type }} · {{ formatSize(doc.fileSize) }}
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
