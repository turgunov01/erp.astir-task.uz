<script setup lang="ts">
/**
 * Shared shell for id-addressed detail panels.
 *
 * The three panels below differ only in what they fetch and render, so the
 * chrome — header, loading, error, offset, width — lives here once instead of
 * being copied three times.
 */
const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  offset: number
  pending?: boolean
  error?: boolean
  /** Assets need room for a version list beside the metadata. */
  width?: 'default' | 'wide'
  panelLabel: string
}>(), { width: 'default' })

const emit = defineEmits<{ (e: 'close'): void, (e: 'retry'): void }>()

const widthClass = computed(() =>
  props.width === 'wide' ? 'max-w-3xl' : 'max-w-xl'
)
</script>

<template>
  <aside
    class="drawer-panel pointer-events-auto relative flex h-full w-full flex-col border-l bg-background shadow-xl"
    :class="widthClass"
    :style="{ marginRight: props.offset * 28 + 'px' }"
    role="dialog"
    aria-modal="true"
    :aria-label="props.panelLabel"
  >
    <header class="flex items-start justify-between gap-3 border-b px-5 py-3.5">
      <div class="min-w-0">
        <p v-if="props.subtitle" class="text-xs text-muted-foreground">{{ props.subtitle }}</p>
        <h2 class="mt-0.5 truncate text-sm font-semibold tracking-tight">{{ props.title }}</h2>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <slot name="header-actions" />
        <button
          type="button"
          class="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Закрыть"
          @click="emit('close')"
        >
          <Icon name="lucide:x" class="size-4" />
        </button>
      </div>
    </header>

    <div v-if="props.pending" class="space-y-3 p-5">
      <div class="h-5 w-2/3 rounded bg-muted" />
      <div class="h-24 rounded bg-muted" />
      <div class="h-4 w-1/2 rounded bg-muted" />
    </div>

    <div v-else-if="props.error" class="grid flex-1 place-items-center px-6 text-center">
      <div>
        <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
        <p class="mt-3 text-sm">Не удалось загрузить данные</p>
        <button
          type="button"
          class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
          @click="emit('retry')"
        >
          Повторить
        </button>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="border-t px-5 py-3.5">
      <slot name="footer" />
    </footer>
  </aside>
</template>
