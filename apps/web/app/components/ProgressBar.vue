<script setup lang="ts">
const props = defineProps<{ value: number, risk?: string }>()

const clamped = computed(() => Math.min(100, Math.max(0, props.value ?? 0)))

const barClass = computed(() => {
  if (props.risk === 'CRITICAL') return 'bg-destructive'
  if (props.risk === 'HIGH') return 'bg-signal'
  return 'bg-primary'
})
</script>

<template>
  <div class="flex items-center gap-2.5">
    <div class="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
      <div
        class="h-full rounded-full"
        :class="barClass"
        :style="{ width: clamped + '%' }"
      />
    </div>
    <span class="w-9 text-right text-xs tabular-nums text-muted-foreground">{{ clamped }}%</span>
  </div>
</template>
