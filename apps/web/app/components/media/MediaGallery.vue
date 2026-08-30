<script setup lang="ts">
export interface MediaItem {
  id: string
  name: string
  fileUrl: string
  mimeType: string | null
  fileSize: string | null
}

const props = defineProps<{ items: MediaItem[], startIndex?: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const index = ref(Math.min(props.startIndex ?? 0, Math.max(props.items.length - 1, 0)))

const current = computed(() => props.items[index.value])

function kindOf(item: MediaItem | undefined) {
  const mime = item?.mimeType ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

function step(delta: number) {
  if (props.items.length === 0) return
  // Wraps around, so the arrows never dead-end on the first or last item.
  index.value = (index.value + delta + props.items.length) % props.items.length
}

function formatSize(bytes: string | null) {
  if (!bytes) return ''
  const value = Number(bytes)
  if (value < 1024) return value + ' B'
  if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB'
  return (value / (1024 * 1024)).toFixed(1) + ' MB'
}

onMounted(() => {
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') emit('close')
    if (event.key === 'ArrowRight') step(1)
    if (event.key === 'ArrowLeft') step(-1)
  }
  window.addEventListener('keydown', handler)
  document.body.style.overflow = 'hidden'
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handler)
    document.body.style.overflow = ''
  })
})
</script>

<template>
  <div class="fixed inset-0 z-[70] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label="Галерея">
    <header class="flex items-center justify-between gap-4 px-5 py-3 text-white">
      <div class="min-w-0">
        <p class="truncate text-sm font-medium">{{ current?.name }}</p>
        <p class="mt-0.5 text-xs text-white/60">
          {{ index + 1 }} из {{ items.length }}
          <span v-if="current">· {{ formatSize(current.fileSize) }}</span>
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <a
          v-if="current"
          :href="current.fileUrl"
          target="_blank"
          rel="noopener"
          class="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Открыть файл в новой вкладке"
        >
          <Icon name="lucide:external-link" class="size-4" />
        </a>
        <button
          type="button"
          class="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Закрыть галерею"
          @click="emit('close')"
        >
          <Icon name="lucide:x" class="size-5" />
        </button>
      </div>
    </header>

    <div class="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
      <button
        v-if="items.length > 1"
        type="button"
        class="absolute left-4 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Предыдущий файл"
        @click="step(-1)"
      >
        <Icon name="lucide:chevron-left" class="size-5" />
      </button>

      <img
        v-if="kindOf(current) === 'image' && current"
        :src="current.fileUrl"
        :alt="current.name"
        class="max-h-full max-w-full object-contain"
      >
      <video
        v-else-if="kindOf(current) === 'video' && current"
        :src="current.fileUrl"
        controls
        class="max-h-full max-w-full"
      />
      <div v-else-if="kindOf(current) === 'audio' && current" class="w-full max-w-lg text-center">
        <Icon name="lucide:music" class="mx-auto size-14 text-white/40" />
        <p class="mt-4 text-sm text-white/80">{{ current.name }}</p>
        <audio :src="current.fileUrl" controls class="mt-4 w-full" />
      </div>
      <div v-else class="text-center text-white/70">
        <Icon name="lucide:file" class="mx-auto size-14 text-white/40" />
        <p class="mt-4 text-sm">Предпросмотр недоступен для этого типа</p>
        <a
          v-if="current"
          :href="current.fileUrl"
          target="_blank"
          rel="noopener"
          class="mt-3 inline-block rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          Открыть файл
        </a>
      </div>

      <button
        v-if="items.length > 1"
        type="button"
        class="absolute right-4 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Следующий файл"
        @click="step(1)"
      >
        <Icon name="lucide:chevron-right" class="size-5" />
      </button>
    </div>

    <!-- Thumbnail strip doubles as the position indicator. -->
    <div v-if="items.length > 1" class="flex justify-center gap-2 overflow-x-auto px-5 pb-5">
      <button
        v-for="(item, position) in items"
        :key="item.id"
        type="button"
        class="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border-2"
        :class="position === index ? 'border-white' : 'border-white/20 opacity-60 hover:opacity-100'"
        :aria-label="'Открыть ' + item.name"
        @click="index = position"
      >
        <img
          v-if="kindOf(item) === 'image'"
          :src="item.fileUrl"
          :alt="item.name"
          class="size-full object-cover"
        >
        <Icon
          v-else
          :name="kindOf(item) === 'video' ? 'lucide:video' : kindOf(item) === 'audio' ? 'lucide:music' : 'lucide:file'"
          class="size-5 text-white/70"
        />
      </button>
    </div>
  </div>
</template>
