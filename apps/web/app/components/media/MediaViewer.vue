<script setup lang="ts">
/**
 * The full-screen file viewer, mounted once in the layout.
 *
 * Whatever list it was opened with becomes a gallery: arrows, swipe and the
 * thumbnail strip move through it. Images zoom and pan, video gets frame
 * stepping and speed, audio and PDF play inline, and anything else gets a card
 * with a download — so opening a file never leaves the page.
 */
const { t } = useI18n()
const viewer = useMediaViewer()
const { items, index, isOpen, current } = viewer

interface StageHandle { handleKey?: (event: KeyboardEvent) => boolean }

const root = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const stage = ref<StageHandle | null>(null)
const strip = ref<HTMLElement | null>(null)
const zoomed = ref(false)
const infoOpen = ref(false)
const dimensions = ref<{ width: number, height: number, duration?: number } | null>(null)
const reducedMotion = usePreferredReducedMotion()

const kind = computed(() => current.value ? mediaKind(current.value.mimeType, current.value.name) : 'file')
const url = computed(() => safeMediaUrl(current.value?.url))
const count = computed(() => items.value.length)

const TOOL = 'grid size-9 place-items-center rounded-md text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white aria-pressed:bg-white/15 aria-pressed:text-white'
const NAV = 'absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white'

/* Opening and closing: scroll lock, initial focus, and focus handed back. */
let returnFocus: HTMLElement | null = null
/* A task drawer underneath may already hold the lock; hand back exactly what was there. */
let previousOverflow = ''

watch(isOpen, async (open) => {
  if (!import.meta.client) return
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Wide screens have room for the details beside the file; phones open them on demand.
    infoOpen.value = window.matchMedia('(min-width: 1280px)').matches
    await nextTick()
    closeButton.value?.focus()
  } else {
    document.body.style.overflow = previousOverflow
    returnFocus?.focus()
    returnFocus = null
  }
})

// Back button or a link elsewhere: the viewer belongs to the page it was opened on.
const route = useRoute()
watch(() => route.fullPath, () => { if (isOpen.value) viewer.close() })

onBeforeUnmount(() => {
  if (import.meta.client && isOpen.value) document.body.style.overflow = previousOverflow
})

/* Each new item: reset per-file state, keep the strip in view, warm the neighbours. */
watch(() => (isOpen.value ? current.value?.id : null), async (id) => {
  if (!id) return
  zoomed.value = false
  dimensions.value = null
  await nextTick()
  strip.value?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({
    block: 'nearest',
    inline: 'center',
    behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth'
  })
  for (const delta of [1, -1]) {
    const neighbour = items.value[(index.value + delta + count.value) % count.value]
    const src = neighbour && mediaKind(neighbour.mimeType, neighbour.name) === 'image'
      ? safeMediaUrl(neighbour.url)
      : null
    if (src) new Image().src = src
  }
})

/* Keyboard: the stage gets first say, then gallery navigation; Tab stays inside. */
const FOCUSABLE = 'a[href], button:not([disabled]), select, input, textarea, iframe, video[controls], audio[controls], [tabindex]:not([tabindex="-1"])'

function trapTab(event: KeyboardEvent) {
  const nodes = Array.from(root.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    .filter(node => node.getClientRects().length > 0)
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  if (!first || !last) return
  const active = document.activeElement
  if (event.shiftKey && (active === first || !root.value?.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !root.value?.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!isOpen.value) return
  if (event.key === 'Tab') return trapTab(event)
  if (event.key === 'Escape') {
    // The drawer underneath listens for Escape too; this press belongs to the viewer.
    event.preventDefault()
    event.stopImmediatePropagation()
    if (infoOpen.value && !window.matchMedia('(min-width: 640px)').matches) infoOpen.value = false
    else viewer.close()
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, select, textarea')) return
  if (stage.value?.handleKey?.(event)) {
    event.preventDefault()
    return
  }
  // A focused player seeks with the arrows; leave them to it.
  const onPlayer = target instanceof HTMLMediaElement
  if (event.key === 'ArrowRight' && !onPlayer) { event.preventDefault(); viewer.step(1) }
  else if (event.key === 'ArrowLeft' && !onPlayer) { event.preventDefault(); viewer.step(-1) }
  else if (event.key === 'Home') { event.preventDefault(); viewer.select(0) }
  else if (event.key === 'End') { event.preventDefault(); viewer.select(count.value - 1) }
  else if (event.key === 'i' || event.key === 'I') { infoOpen.value = !infoOpen.value }
}

// Capture phase, so the viewer hears keys before the drawers and dialogs beneath it.
useEventListener('keydown', onKeydown, { capture: true })

/* Swipe between files on touch screens, unless the image is zoomed and the finger is panning. */
let swipe: { id: number, x: number, y: number } | null = null
let touches = 0

function onStagePointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse') return
  touches += 1
  const target = event.target as HTMLElement
  swipe = touches === 1 && !target.closest('video, audio, button, select, [role="toolbar"]')
    ? { id: event.pointerId, x: event.clientX, y: event.clientY }
    : null
}

function onStagePointerUp(event: PointerEvent) {
  if (event.pointerType === 'mouse') return
  touches = Math.max(0, touches - 1)
  const start = swipe
  if (!start || start.id !== event.pointerId) return
  swipe = null
  if (zoomed.value || count.value < 2) return
  const dx = event.clientX - start.x
  const dy = event.clientY - start.y
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) viewer.step(dx < 0 ? 1 : -1)
}

function onStagePointerCancel() {
  touches = 0
  swipe = null
}

function onAudioMeta(event: Event) {
  dimensions.value = { width: 0, height: 0, duration: (event.target as HTMLAudioElement).duration }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-100 motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen && current"
        ref="root"
        class="fixed inset-0 z-[70] flex flex-col bg-neutral-950 text-white"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-viewer-title"
      >
        <header class="flex items-center gap-2 px-3 py-2 sm:px-5">
          <div class="min-w-0 flex-1">
            <h2 id="media-viewer-title" class="truncate text-sm font-medium">{{ current.name }}</h2>
            <p class="mt-0.5 truncate text-xs text-white/55" aria-live="polite">
              <span class="tabular-nums">{{ t('projects.files.batch', { current: index + 1, total: count }) }}</span>
              · {{ MEDIA_KIND_LABEL[kind] }}
              <template v-if="formatBytes(current.size)">· {{ formatBytes(current.size) }}</template>
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              :class="TOOL"
              :aria-pressed="infoOpen"
              :aria-label="t('projects.media.infoToggle')"
              @click="infoOpen = !infoOpen"
            >
              <Icon name="lucide:info" class="size-4" />
            </button>
            <a v-if="url" :href="url" :download="current.name" :class="TOOL" :aria-label="t('common.actions.download')">
              <Icon name="lucide:download" class="size-4" />
            </a>
            <a
              v-if="url"
              :href="url"
              target="_blank"
              rel="noopener noreferrer"
              :class="[TOOL, 'max-sm:hidden']"
              :aria-label="t('projects.media.newTab')"
            >
              <Icon name="lucide:external-link" class="size-4" />
            </a>
            <button
              ref="closeButton"
              type="button"
              :class="TOOL"
              :aria-label="t('projects.media.close')"
              @click="viewer.close()"
            >
              <Icon name="lucide:x" class="size-5" />
            </button>
          </div>
        </header>

        <div class="relative flex min-h-0 flex-1">
          <div
            class="relative min-w-0 flex-1 px-2 pb-2 sm:px-16"
            @pointerdown="onStagePointerDown"
            @pointerup="onStagePointerUp"
            @pointercancel="onStagePointerCancel"
          >
            <MediaViewerImage
              v-if="kind === 'image' && url"
              ref="stage"
              :src="url"
              :alt="current.name"
              @zoomed="zoomed = $event"
              @meta="dimensions = $event"
            />
            <MediaViewerVideo
              v-else-if="kind === 'video' && url"
              ref="stage"
              :src="url"
              :name="current.name"
              @meta="dimensions = $event"
            />
            <div v-else-if="kind === 'audio' && url" class="grid size-full place-items-center">
              <div class="w-full max-w-lg text-center">
                <span class="mx-auto grid size-24 place-items-center rounded-2xl bg-white/5">
                  <Icon name="lucide:music" class="size-10 text-white/50" />
                </span>
                <p class="mt-5 break-words text-sm text-white/80">{{ current.name }}</p>
                <audio
                  :src="url"
                  controls
                  preload="metadata"
                  class="mt-5 w-full"
                  :aria-label="current.name"
                  @loadedmetadata="onAudioMeta"
                />
              </div>
            </div>
            <iframe
              v-else-if="(kind === 'pdf' || kind === 'text') && url"
              :src="url"
              :title="current.name"
              class="size-full rounded-md bg-white"
            />
            <div v-else class="grid size-full place-items-center">
              <div class="max-w-sm rounded-xl border border-white/10 bg-white/5 px-8 py-10 text-center">
                <Icon :name="MEDIA_KIND_ICON[kind]" class="mx-auto size-12 text-white/40" />
                <p class="mt-4 break-words text-sm font-medium">{{ current.name }}</p>
                <p class="mt-1 text-xs text-white/55">
                  {{ t('projects.media.noPreview') }}
                  <template v-if="fileFormat(current.name)"> · {{ fileFormat(current.name) }}</template>
                </p>
                <a
                  v-if="url"
                  :href="url"
                  :download="current.name"
                  class="mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-black hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <Icon name="lucide:download" class="size-4" />
                  {{ t('common.actions.download') }} {{ formatBytes(current.size) }}
                </a>
              </div>
            </div>

            <template v-if="count > 1">
              <button
                type="button"
                :class="[NAV, 'left-2 sm:left-3']"
                :aria-label="t('projects.media.prev')"
                @click="viewer.step(-1)"
              >
                <Icon name="lucide:chevron-left" class="size-5" />
              </button>
              <button
                type="button"
                :class="[NAV, 'right-2 sm:right-3']"
                :aria-label="t('projects.media.next')"
                @click="viewer.step(1)"
              >
                <Icon name="lucide:chevron-right" class="size-5" />
              </button>
            </template>
          </div>

          <!-- Beside the file on wide screens, a sheet over it on phones. -->
          <aside
            v-if="infoOpen"
            class="absolute inset-x-0 bottom-0 z-20 max-h-[65%] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-neutral-900 p-5 shadow-2xl sm:static sm:max-h-none sm:w-72 sm:shrink-0 sm:rounded-none sm:border-l sm:border-t-0 sm:shadow-none"
            :aria-label="t('projects.media.info.title')"
          >
            <MediaViewerInfo :item="current" :dimensions="dimensions" :download-url="url" />
          </aside>
        </div>

        <nav v-if="count > 1" class="shrink-0 px-3 pb-3 sm:px-5" :aria-label="t('projects.media.strip')">
          <ol ref="strip" class="flex gap-2 overflow-x-auto py-1 [scrollbar-width:thin]">
            <li v-for="(item, position) in items" :key="item.id" class="shrink-0">
              <button
                type="button"
                class="block size-14 overflow-hidden rounded-md border-2 bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                :class="position === index ? 'border-white' : 'border-transparent opacity-55 hover:opacity-100'"
                :aria-current="position === index ? 'true' : undefined"
                :aria-label="(position + 1) + ': ' + item.name"
                @click="viewer.select(position)"
              >
                <MediaThumb :item="item" icon-class="size-5 text-white/60" :show-badge="false" />
              </button>
            </li>
          </ol>
        </nav>
      </div>
    </Transition>
  </Teleport>
</template>
