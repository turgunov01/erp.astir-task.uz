<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  message: string
  /** Extra line for consequences the user should read before confirming. */
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'neutral'
  pending?: boolean
}>(), {
  confirmLabel: 'Подтвердить',
  cancelLabel: 'Отмена',
  tone: 'danger'
})

const emit = defineEmits<{ (e: 'confirm'): void, (e: 'cancel'): void }>()

const confirmButton = ref<HTMLButtonElement | null>(null)

onMounted(() => {
  // Focus lands on the dialog, not behind it, and Escape always cancels.
  confirmButton.value?.focus()
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') emit('cancel')
  }
  window.addEventListener('keydown', handler)
  onBeforeUnmount(() => window.removeEventListener('keydown', handler))
})
</script>

<template>
  <div
    class="fixed inset-0 z-[60] grid place-items-center px-4"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
    aria-describedby="confirm-message"
  >
    <div class="drawer-scrim absolute inset-0 bg-black/50" @click="emit('cancel')" />

    <div class="dialog-panel relative w-full max-w-md overflow-hidden rounded-xl border bg-background shadow-xl">
      <div class="flex gap-4 px-6 py-5">
        <span
          class="grid size-10 shrink-0 place-items-center rounded-full"
          :class="props.tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground'"
        >
          <Icon
            :name="props.tone === 'danger' ? 'lucide:triangle-alert' : 'lucide:help-circle'"
            class="size-5"
          />
        </span>

        <div class="min-w-0">
          <h2 id="confirm-title" class="text-base font-semibold tracking-tight">
            {{ props.title }}
          </h2>
          <p id="confirm-message" class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {{ props.message }}
          </p>
          <p v-if="props.detail" class="mt-2 text-xs leading-relaxed text-muted-foreground">
            {{ props.detail }}
          </p>
        </div>
      </div>

      <footer class="flex items-center justify-end gap-3 border-t bg-muted/20 px-6 py-3.5">
        <button
          type="button"
          class="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          @click="emit('cancel')"
        >
          {{ props.cancelLabel }}
        </button>
        <button
          ref="confirmButton"
          type="button"
          class="h-9 rounded-md px-4 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          :class="props.tone === 'danger' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'"
          :disabled="props.pending"
          @click="emit('confirm')"
        >
          {{ props.pending ? 'Выполняется...' : props.confirmLabel }}
        </button>
      </footer>
    </div>
  </div>
</template>
