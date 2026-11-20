<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'reka-ui'

const props = defineProps<{ open: boolean, title: string, pending?: boolean, wide?: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const { t } = useI18n()
const body = ref<HTMLElement | null>(null)
function updateOpen(value: boolean) {
  if (!props.pending) emit('update:open', value)
}
function focusInput(event: Event) {
  event.preventDefault()
  nextTick(() => body.value?.querySelector<HTMLElement>('input, select, button')?.focus())
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="updateOpen">
    <DialogPortal>
      <DialogOverlay class="drawer-scrim fixed inset-0 z-[60] bg-black/50" />
      <DialogContent
        :aria-describedby="undefined"
        class="dialog-panel fixed left-1/2 top-1/2 z-[61] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-xl"
        :class="props.wide ? 'max-w-5xl' : 'max-w-md'"
        @open-auto-focus="focusInput"
        @escape-key-down="props.pending && $event.preventDefault()"
        @interact-outside="props.pending && $event.preventDefault()"
      >
        <header class="flex items-center justify-between gap-4 border-b px-5 py-4">
          <DialogTitle class="text-base font-semibold">{{ props.title }}</DialogTitle>
          <button type="button" class="grid size-9 shrink-0 place-items-center rounded-md hover:bg-muted disabled:opacity-50" :aria-label="t('common.actions.close')" :disabled="props.pending" @click="updateOpen(false)">
            <Icon name="lucide:x" class="size-4" />
          </button>
        </header>
        <div ref="body" class="min-h-0 overflow-y-auto p-5"><slot /></div>
        <footer class="flex shrink-0 justify-end gap-2 border-t bg-muted/20 px-5 py-3"><slot name="footer" /></footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
