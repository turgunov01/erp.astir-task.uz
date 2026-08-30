<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="flex items-start justify-between gap-3 px-5 py-2.5 text-sm">
    <dt class="shrink-0 text-muted-foreground">{{ label }}</dt>
    <dd class="min-w-0 text-right"><slot /></dd>
  </div>
</template>
