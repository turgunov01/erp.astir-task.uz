<script setup lang="ts">
/**
 * An image that zooms and pans: wheel and pinch zoom around the pointer,
 * drag to pan once zoomed, double-click to toggle between fit and close-up.
 *
 * Scale is absolute — 1 means one image pixel per CSS pixel — so "1:1" really
 * is actual size whatever the window. Only transform changes, never layout.
 */
const props = defineProps<{ src: string, alt: string }>()
const emit = defineEmits<{
  zoomed: [value: boolean]
  meta: [value: { width: number, height: number }]
}>()

const MAX_SCALE = 8
const STEP = 1.25
const TOOL = 'grid h-8 min-w-8 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white aria-pressed:bg-white/15'

const stage = ref<HTMLElement | null>(null)
const natural = ref({ width: 0, height: 0 })
const box = ref({ width: 0, height: 0 })
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const loaded = ref(false)
const failed = ref(false)
/** Fit tracks the window while it resizes; a deliberate zoom stays put. */
const fitted = ref(true)
const dragging = ref(false)

const fitScale = computed(() => {
  const { width, height } = natural.value
  if (!width || !height || !box.value.width || !box.value.height) return 1
  // Small images are shown at their real size, not blown up to fill.
  return Math.min(box.value.width / width, box.value.height / height, 1)
})
const minScale = computed(() => fitScale.value)
const isZoomed = computed(() => scale.value > fitScale.value * 1.01)
const percent = computed(() => Math.round(scale.value * 100))

watch(isZoomed, value => emit('zoomed', value))

function clampTranslate(x: number, y: number, s = scale.value) {
  const overflowX = Math.max(0, (natural.value.width * s - box.value.width) / 2)
  const overflowY = Math.max(0, (natural.value.height * s - box.value.height) / 2)
  return {
    x: Math.min(overflowX, Math.max(-overflowX, x)),
    y: Math.min(overflowY, Math.max(-overflowY, y))
  }
}

function fit() {
  // A cached image can load before the first resize callback has measured the stage.
  if (!box.value.width && stage.value) {
    box.value = { width: stage.value.clientWidth, height: stage.value.clientHeight }
  }
  scale.value = fitScale.value
  tx.value = 0
  ty.value = 0
  fitted.value = true
}

/** Zooms so the image point under (clientX, clientY) stays under it. */
function zoomTo(next: number, clientX?: number, clientY?: number) {
  const target = Math.min(MAX_SCALE, Math.max(minScale.value, next))
  const rect = stage.value?.getBoundingClientRect()
  const px = rect && clientX !== undefined ? clientX - rect.left - rect.width / 2 : 0
  const py = rect && clientY !== undefined ? clientY - rect.top - rect.height / 2 : 0
  const ratio = target / scale.value
  const moved = clampTranslate(px - (px - tx.value) * ratio, py - (py - ty.value) * ratio, target)
  scale.value = target
  tx.value = moved.x
  ty.value = moved.y
  fitted.value = target <= fitScale.value * 1.01
}

function zoomIn() { zoomTo(scale.value * STEP) }
function zoomOut() { zoomTo(scale.value / STEP) }
function actualSize() { zoomTo(1) }

function onLoad(event: Event) {
  const img = event.target as HTMLImageElement
  natural.value = { width: img.naturalWidth, height: img.naturalHeight }
  loaded.value = true
  emit('meta', { ...natural.value })
  fit()
}

watch(() => props.src, () => {
  loaded.value = false
  failed.value = false
  natural.value = { width: 0, height: 0 }
  fit()
})

useResizeObserver(stage, entries => {
  const rect = entries[0]?.contentRect
  if (!rect) return
  box.value = { width: rect.width, height: rect.height }
  if (fitted.value) fit()
  else {
    const moved = clampTranslate(tx.value, ty.value)
    tx.value = moved.x
    ty.value = moved.y
  }
})

function onWheel(event: WheelEvent) {
  if (!loaded.value) return
  // Trackpad pinch arrives as ctrl+wheel with small deltas; same curve works.
  zoomTo(scale.value * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY)
}

function onDoubleClick(event: MouseEvent) {
  if (isZoomed.value) fit()
  else zoomTo(Math.max(1, fitScale.value * 2.5), event.clientX, event.clientY)
}

/* Pointer tracking: one pointer pans, two pinch. */
const pointers = new Map<number, { x: number, y: number }>()
let pinch: { distance: number, scale: number } | null = null
let last: { x: number, y: number } | null = null

function pinchDistance() {
  const [a, b] = [...pointers.values()]
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}

function onPointerDown(event: PointerEvent) {
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) {
    pinch = { distance: pinchDistance(), scale: scale.value }
    last = null
    dragging.value = true
  } else if (pointers.size === 1 && isZoomed.value) {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    last = { x: event.clientX, y: event.clientY }
    dragging.value = true
  }
}

function onPointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const distance = pinchDistance()
    if (a && b && pinch.distance > 0) {
      zoomTo(pinch.scale * (distance / pinch.distance), (a.x + b.x) / 2, (a.y + b.y) / 2)
    }
    return
  }
  if (last && dragging.value) {
    const moved = clampTranslate(tx.value + event.clientX - last.x, ty.value + event.clientY - last.y)
    tx.value = moved.x
    ty.value = moved.y
    last = { x: event.clientX, y: event.clientY }
  }
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinch = null
  if (pointers.size === 0) {
    last = null
    dragging.value = false
  }
}

/** Keys the shell forwards; true when the key was used here. */
function handleKey(event: KeyboardEvent): boolean {
  if (event.key === '+' || event.key === '=') { zoomIn(); return true }
  if (event.key === '-' || event.key === '_') { zoomOut(); return true }
  if (event.key === '0') { fit(); return true }
  if (event.key === '1') { actualSize(); return true }
  return false
}

defineExpose({ handleKey })

const transform = computed(() =>
  'translate(-50%, -50%) translate(' + tx.value + 'px, ' + ty.value + 'px) scale(' + scale.value + ')'
)
</script>

<template>
  <div class="relative size-full">
    <div
      ref="stage"
      class="absolute inset-0 touch-none select-none overflow-hidden"
      :class="isZoomed ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'"
      @wheel.prevent="onWheel"
      @dblclick="onDoubleClick"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <img
        :src="src"
        :alt="alt"
        draggable="false"
        class="absolute left-1/2 top-1/2 max-w-none origin-center"
        :class="[loaded ? 'opacity-100' : 'opacity-0', dragging ? '' : 'transition-transform duration-150 ease-out motion-reduce:transition-none']"
        :style="{
          width: natural.width ? natural.width + 'px' : undefined,
          height: natural.height ? natural.height + 'px' : undefined,
          transform
        }"
        @load="onLoad"
        @error="failed = true"
      >

      <div v-if="!loaded && !failed" class="absolute inset-0 grid place-items-center" role="status">
        <Icon name="lucide:loader-circle" class="size-7 animate-spin text-white/60 motion-reduce:animate-none" />
        <span class="sr-only">Загрузка изображения</span>
      </div>
      <div v-if="failed" class="absolute inset-0 grid place-items-center text-center text-white/70">
        <div>
          <Icon name="lucide:image-off" class="mx-auto size-10 text-white/40" />
          <p class="mt-3 text-sm">Не удалось загрузить изображение</p>
        </div>
      </div>
    </div>

    <!-- Zoom controls: the same actions as the wheel, pinch and keys. -->
    <div
      v-if="loaded"
      class="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-black/70 p-1 text-white shadow-lg backdrop-blur"
      role="toolbar"
      aria-label="Масштаб"
    >
      <button type="button" :class="TOOL" aria-label="Уменьшить (−)" @click="zoomOut">
        <Icon name="lucide:zoom-out" class="size-4" />
      </button>
      <span class="w-12 text-center text-xs tabular-nums" aria-live="polite">{{ percent }}%</span>
      <button type="button" :class="TOOL" aria-label="Увеличить (+)" @click="zoomIn">
        <Icon name="lucide:zoom-in" class="size-4" />
      </button>
      <span class="mx-1 h-4 w-px bg-white/20" aria-hidden="true" />
      <button
        type="button"
        :class="TOOL"
        :aria-pressed="!isZoomed"
        aria-label="Вписать в окно (0)"
        @click="fit"
      >
        <Icon name="lucide:shrink" class="size-4" />
      </button>
      <button
        type="button"
        :class="[TOOL, 'px-2 text-xs font-medium']"
        :aria-pressed="scale === 1"
        aria-label="Реальный размер (1)"
        @click="actualSize"
      >
        1:1
      </button>
    </div>
  </div>
</template>
