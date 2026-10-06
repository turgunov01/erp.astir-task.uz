<script setup lang="ts">
const props = defineProps<{
  value: number
  risk?: string
  /** Stretch the track to the container instead of the compact table width. */
  fluid?: boolean
}>()

const clamped = computed(() => Math.min(100, Math.max(0, props.value ?? 0)))

const barClass = computed(() => {
  if (props.risk === 'CRITICAL') return 'bg-destructive'
  if (props.risk === 'HIGH') return 'bg-signal'
  return 'bg-primary'
})
</script>

<template>
  <div class="flex items-center gap-2.5">
    <div
      class="h-1.5 overflow-hidden rounded-full bg-muted"
      :class="props.fluid ? 'min-w-0 flex-1' : 'w-24'"
    >
      <div
        class="h-full rounded-full"
        :class="barClass"
        :style="{ width: clamped + '%' }"
      />
    </div>
    <span class="w-9 text-right text-xs tabular-nums text-muted-foreground">{{ clamped }}%</span>
  </div>
</template>
