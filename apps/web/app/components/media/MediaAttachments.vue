<script setup lang="ts">
import type { MediaItem } from '~/components/media/MediaGallery.vue'
import { apiErrorMessage } from '~/composables/useApi'

/**
 * Photo, video and audio attached to one record.
 *
 * Tasks and reviews both need this, and they differ only in which column the
 * upload is filed under, so the owner is a parameter rather than two copies of
 * the component.
 */
const props = withDefaults(defineProps<{
  /** Which relation the upload is filed under. */
  ownerKey: 'taskId' | 'reviewId'
  ownerId: string
  canManage: boolean
  title?: string
  emptyText?: string
}>(), {
  title: 'Вложения',
  emptyText: 'Файлов нет. Прикрепление не обязательно — фото, видео или аудио по желанию.'
})

interface Attachment extends MediaItem {
  type: string
  createdAt: string
  uploadedBy: { firstName: string, lastName: string } | null
}

const { data, pending, error, refresh } = await useFetch<{ data: Attachment[] }>('/api/files', {
  query: computed(() => ({ [props.ownerKey]: props.ownerId, limit: 50 })),
  credentials: 'include',
  default: () => ({ data: [] })
})

const files = computed(() => data.value?.data ?? [])

/** Only media opens in the gallery; a PDF is better handled by the browser. */
const media = computed(() =>
  files.value.filter(file =>
    file.mimeType && /^(image|video|audio)\//.test(file.mimeType)
  )
)

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const errorMessage = ref('')
const galleryOpen = ref(false)
const galleryStart = ref(0)

async function upload(list: FileList | null) {
  if (!list || list.length === 0) return
  uploading.value = true
  errorMessage.value = ''
  try {
    for (const file of Array.from(list)) {
      const body = new FormData()
      body.append('file', file)
      body.append(props.ownerKey, props.ownerId)
      body.append('name', file.name)
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

async function remove(id: string) {
  errorMessage.value = ''
  try {
    await $fetch('/api/files/' + id, { method: 'DELETE', credentials: 'include' })
    await refresh()
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось удалить файл')
  }
}

function openGallery(file: Attachment) {
  const position = media.value.findIndex(item => item.id === file.id)
  galleryStart.value = position >= 0 ? position : 0
  galleryOpen.value = true
}

function iconFor(file: Attachment) {
  const mime = file.mimeType ?? ''
  if (mime.startsWith('image/')) return 'lucide:image'
  if (mime.startsWith('video/')) return 'lucide:video'
  if (mime.startsWith('audio/')) return 'lucide:music'
  return 'lucide:file'
}

function isImage(file: Attachment) {
  return Boolean(file.mimeType?.startsWith('image/'))
}
</script>

<template>
  <section class="mt-6">
    <div class="flex items-center justify-between gap-2 px-2">
      <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {{ props.title }}
        <span v-if="files.length > 0" class="ml-1 tabular-nums">{{ files.length }}</span>
      </h3>

      <div class="flex items-center gap-1">
        <!-- Worth a dedicated button only once there is more than one to page through. -->
        <button
          v-if="media.length > 1"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-secondary"
          @click="galleryOpen = true"
        >
          <Icon name="lucide:images" class="size-3.5" />
          Посмотреть
        </button>
        <button
          v-if="props.canManage"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-50"
          :disabled="uploading"
          @click="fileInput?.click()"
        >
          <Icon name="lucide:paperclip" class="size-3.5" />
          {{ uploading ? 'Загрузка...' : 'Прикрепить' }}
        </button>
        <input
          ref="fileInput"
          type="file"
          multiple
          accept="image/*,video/*,audio/*,application/pdf"
          class="sr-only"
          @change="upload(($event.target as HTMLInputElement).files)"
        >
      </div>
    </div>

    <p v-if="errorMessage" role="alert" class="mt-2 px-2 text-xs text-destructive">
      {{ errorMessage }}
    </p>

    <div v-if="pending && files.length === 0" class="mt-2 grid grid-cols-3 gap-2 px-2">
      <div v-for="n in 3" :key="n" class="h-20 rounded-lg bg-muted" />
    </div>

    <p
      v-else-if="files.length === 0"
      class="mt-2 px-2 text-sm text-muted-foreground"
    >
      {{ props.emptyText }}
    </p>

    <p v-else-if="error" class="mt-2 px-2 text-sm text-destructive">
      Не удалось загрузить вложения
    </p>

    <ul v-else class="mt-2 grid grid-cols-3 gap-2 px-2">
      <li v-for="file in files" :key="file.id" class="group relative">
        <button
          type="button"
          class="block w-full overflow-hidden rounded-lg border bg-muted/40"
          :aria-label="'Открыть ' + file.name"
          @click="openGallery(file)"
        >
          <span class="grid h-20 place-items-center">
            <img
              v-if="isImage(file)"
              :src="file.fileUrl"
              :alt="file.name"
              loading="lazy"
              class="size-full object-cover"
            >
            <Icon v-else :name="iconFor(file)" class="size-6 text-muted-foreground" />
          </span>
        </button>
        <p class="mt-1 truncate px-0.5 text-xs text-muted-foreground">{{ file.name }}</p>

        <button
          v-if="props.canManage"
          type="button"
          class="absolute right-1 top-1 rounded-md bg-background/90 p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
          :aria-label="'Удалить ' + file.name"
          @click.stop="remove(file.id)"
        >
          <Icon name="lucide:trash-2" class="size-3" />
        </button>
      </li>
    </ul>

    <MediaGallery
      v-if="galleryOpen && media.length > 0"
      :items="media"
      :start-index="galleryStart"
      @close="galleryOpen = false"
    />
  </section>
</template>
