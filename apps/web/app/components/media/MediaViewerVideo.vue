<script setup lang="ts">
/**
 * Native video playback with what an animation review needs on top: frame
 * stepping, playback speed, looping and a frame-accurate timecode.
 *
 * The browser's own controls stay — they already do seeking (the API answers
 * Range requests), volume, fullscreen and picture-in-picture well.
 */
const props = defineProps<{ src: string, name: string }>()
const { t } = useI18n()
const emit = defineEmits<{
  meta: [value: { width: number, height: number, duration: number }]
}>()

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]
const FRAME_RATES = [24, 25, 30, 60]
const TOOL = 'grid h-8 min-w-8 place-items-center rounded-md px-1.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white aria-pressed:bg-white/15'

const video = ref<HTMLVideoElement | null>(null)
/* Kept across items: someone reviewing at half speed wants the next clip at half speed too. */
const speed = useState('media-viewer-speed', () => 1)
const fps = useState('media-viewer-fps', () => 24)
const loop = useState('media-viewer-loop', () => false)
const time = ref(0)
const failed = ref(false)

const frame = computed(() => Math.floor(time.value * fps.value + 0.001))

/** HH:MM:SS:FF, the way editors and animators read time. */
const timecode = computed(() => {
  const totalFrames = frame.value
  const ff = totalFrames % fps.value
  const totalSeconds = Math.floor(totalFrames / fps.value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return pad(Math.floor(totalSeconds / 3600)) + ':' + pad(Math.floor(totalSeconds / 60) % 60) +
    ':' + pad(totalSeconds % 60) + ':' + pad(ff)
})

function syncTime() {
  time.value = video.value?.currentTime ?? 0
}

function onLoadedMetadata() {
  const el = video.value
  if (!el) return
  el.playbackRate = speed.value
  syncTime()
  emit('meta', { width: el.videoWidth, height: el.videoHeight, duration: el.duration })
}

watch(speed, value => { if (video.value) video.value.playbackRate = value })
watch(() => props.src, () => {
  failed.value = false
  time.value = 0
})

function stepFrame(delta: number) {
  const el = video.value
  if (!el) return
  el.pause()
  // Aim at the middle of the target frame so rounding never lands a frame short.
  const target = (frame.value + delta + 0.5) / fps.value
  const max = Number.isFinite(el.duration) ? el.duration : target
  el.currentTime = Math.min(max, Math.max(0, target))
  syncTime()
}

function togglePlay() {
  const el = video.value
  if (!el) return
  if (el.paused) el.play().catch(() => undefined)
  else el.pause()
}

function shiftSpeed(delta: number) {
  const position = SPEEDS.indexOf(speed.value)
  const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, (position === -1 ? 2 : position) + delta))]
  if (next !== undefined) speed.value = next
}

/** Keys the shell forwards; true when the key was used here. */
function handleKey(event: KeyboardEvent): boolean {
  const onVideo = event.target === video.value
  switch (event.key) {
    case ',': stepFrame(-1); return true
    case '.': stepFrame(1); return true
    case '<': shiftSpeed(-1); return true
    case '>': shiftSpeed(1); return true
    case 'k':
    case 'K':
      togglePlay(); return true
    case ' ':
      // The focused element already toggles on space; doing it here too would cancel out.
      if (onVideo) return false
      togglePlay(); return true
    default:
      return false
  }
}

defineExpose({ handleKey })
</script>

<template>
  <div class="flex size-full flex-col items-center justify-center gap-3">
    <div class="flex min-h-0 w-full flex-1 items-center justify-center">
      <video
        v-if="!failed"
        ref="video"
        :src="src"
        :loop="loop"
        controls
        playsinline
        preload="metadata"
        class="max-h-full max-w-full bg-black"
        :aria-label="name"
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="syncTime"
        @seeked="syncTime"
        @error="failed = true"
      />
      <div v-else class="max-w-sm text-center text-white/70">
        <Icon name="lucide:file-video" class="mx-auto size-12 text-white/40" />
        <p class="mt-3 text-sm">{{ t('projects.media.videoUnsupported') }}</p>
        <p class="mt-1 text-xs text-white/50">{{ t('projects.media.videoUnsupportedHint') }}</p>
      </div>
    </div>

    <div
      v-if="!failed"
      class="flex flex-wrap items-center justify-center gap-1 rounded-lg bg-black/60 p-1 text-white"
      role="toolbar"
      :aria-label="t('projects.media.frameByFrame')"
    >
      <button type="button" :class="TOOL" :aria-label="t('projects.media.framePrev')" @click="stepFrame(-1)">
        <Icon name="lucide:step-back" class="size-4" />
      </button>
      <span class="min-w-[6.5rem] text-center font-mono text-xs tabular-nums" :title="t('projects.media.frame', { n: frame })">
        {{ timecode }}
      </span>
      <button type="button" :class="TOOL" :aria-label="t('projects.media.frameNext')" @click="stepFrame(1)">
        <Icon name="lucide:step-forward" class="size-4" />
      </button>

      <span class="mx-1 h-4 w-px bg-white/20" aria-hidden="true" />

      <label class="inline-flex items-center gap-1 text-xs text-white/70">
        <span class="sr-only">{{ t('projects.media.frameRate') }}</span>
        <select
          v-model.number="fps"
          class="h-8 rounded-md bg-transparent px-1 text-xs text-white outline-none hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
        >
          <option v-for="rate in FRAME_RATES" :key="rate" :value="rate" class="text-black">{{ t('projects.shots.fps', { n: rate }) }}</option>
        </select>
      </label>
      <label class="inline-flex items-center gap-1 text-xs text-white/70">
        <Icon name="lucide:gauge" class="size-4" aria-hidden="true" />
        <span class="sr-only">{{ t('projects.media.speed') }}</span>
        <select
          v-model.number="speed"
          class="h-8 rounded-md bg-transparent px-1 text-xs text-white outline-none hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
        >
          <option v-for="rate in SPEEDS" :key="rate" :value="rate" class="text-black">{{ rate }}×</option>
        </select>
      </label>
      <button
        type="button"
        :class="TOOL"
        :aria-pressed="loop"
        :aria-label="t('projects.media.loop')"
        @click="loop = !loop"
      >
        <Icon name="lucide:repeat" class="size-4" />
      </button>
    </div>
  </div>
</template>
