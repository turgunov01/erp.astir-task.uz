<script setup lang="ts">
import type { ViewerItem } from '~/utils/media'

/**
 * The picture a file tile shows: the image itself, a video's first frame, or
 * an icon for everything a browser cannot draw small.
 *
 * Fills its parent; the parent decides the size and the corners.
 */
const props = withDefaults(defineProps<{
  item: Pick<ViewerItem, 'name' | 'url' | 'mimeType' | 'previewUrl'>
  /** Icon size for the non-visual kinds. */
  iconClass?: string
  /** Strip tiles are tiny; the play badge only clutters them. */
  showBadge?: boolean
}>(), {
  iconClass: 'size-6',
  showBadge: true
})

const kind = computed(() => mediaKind(props.item.mimeType, props.item.name))
const imageSrc = computed(() =>
  safeMediaUrl(props.item.previewUrl) ?? (kind.value === 'image' ? safeMediaUrl(props.item.url) : null)
)

/*
 * A video tile only asks for its first frame once it scrolls into view: a page
 * of thirty clips would otherwise open thirty range requests on load.
 */
const root = ref<HTMLElement | null>(null)
const visible = useElementVisibility(root, { rootMargin: '200px' })
const seen = ref(false)
watch(visible, value => { if (value) seen.value = true }, { immediate: true })

const videoSrc = computed(() => {
  if (kind.value !== 'video' || imageSrc.value) return null
  const url = safeMediaUrl(props.item.url)
  // A fragment start makes browsers paint a real frame rather than black.
  return url ? url + '#t=0.1' : null
})

const failed = ref(false)
watch(() => props.item.url, () => { failed.value = false })
</script>

<template>
  <span ref="root" class="relative grid size-full place-items-center overflow-hidden">
    <img
      v-if="imageSrc && !failed"
      :src="imageSrc"
      :alt="item.name"
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
      @error="failed = true"
    >
    <video
      v-else-if="videoSrc && seen && !failed"
      :src="videoSrc"
      preload="metadata"
      muted
      playsinline
      tabindex="-1"
      aria-hidden="true"
      class="pointer-events-none size-full object-cover"
      @error="failed = true"
    />
    <span v-else class="grid place-items-center gap-1 text-muted-foreground">
      <Icon :name="MEDIA_KIND_ICON[kind]" :class="iconClass" />
      <span v-if="kind === 'pdf' && showBadge" class="text-[10px] font-semibold uppercase tracking-wider">PDF</span>
    </span>

    <span
      v-if="kind === 'video' && showBadge"
      class="absolute bottom-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white"
      aria-hidden="true"
    >
      <Icon name="lucide:play" class="size-3" />
    </span>
  </span>
</template>
