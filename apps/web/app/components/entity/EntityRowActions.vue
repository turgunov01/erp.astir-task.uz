<script setup lang="ts">
/**
 * Per-row action menu: edit, archive or restore, delete.
 *
 * Lives in the last column of every table. The trigger is a button, so the
 * row-click handler that opens the detail panel ignores it.
 */
const props = withDefaults(defineProps<{
  /** Viewing the archive, so the archive action becomes a restore. */
  archived?: boolean
  /** Actions that change data are hidden without the right permission. */
  canManage?: boolean
  /** Row is mid-request. */
  busy?: boolean
  /** Label used in the trigger's accessible name. */
  name?: string
}>(), { canManage: true })

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'archive'): void
  (e: 'unarchive'): void
  (e: 'delete'): void
}>()

const open = ref(false)
const container = ref<HTMLElement | null>(null)

function choose(action: 'edit' | 'archive' | 'unarchive' | 'delete') {
  open.value = false
  // Narrowed one by one: the union overload of a typed emit is not callable.
  if (action === 'edit') emit('edit')
  else if (action === 'archive') emit('archive')
  else if (action === 'unarchive') emit('unarchive')
  else emit('delete')
}

onMounted(() => {
  const onPointer = (event: MouseEvent) => {
    if (!open.value) return
    if (!container.value?.contains(event.target as Node)) open.value = false
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open.value) {
      event.stopPropagation()
      open.value = false
    }
  }
  document.addEventListener('click', onPointer)
  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => {
    document.removeEventListener('click', onPointer)
    window.removeEventListener('keydown', onKey)
  })
})
</script>

<template>
  <div ref="container" class="relative flex justify-end" data-row-ignore>
    <button
      type="button"
      class="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
      :aria-label="'Действия' + (props.name ? ': ' + props.name : '')"
      :aria-expanded="open"
      aria-haspopup="menu"
      :disabled="props.busy"
      @click="open = !open"
    >
      <Icon :name="props.busy ? 'lucide:loader' : 'lucide:ellipsis'" class="size-4" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border bg-popover py-1 shadow-lg"
      role="menu"
    >
      <button
        v-if="props.canManage && !props.archived"
        type="button"
        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary"
        role="menuitem"
        @click="choose('edit')"
      >
        <Icon name="lucide:pencil" class="size-4 text-muted-foreground" />
        Редактировать
      </button>

      <button
        v-if="props.canManage && !props.archived"
        type="button"
        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary"
        role="menuitem"
        @click="choose('archive')"
      >
        <Icon name="lucide:archive" class="size-4 text-muted-foreground" />
        Архивировать
      </button>

      <button
        v-if="props.canManage && props.archived"
        type="button"
        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary"
        role="menuitem"
        @click="choose('unarchive')"
      >
        <Icon name="lucide:archive-restore" class="size-4 text-muted-foreground" />
        Вернуть из архива
      </button>

      <div v-if="props.canManage" class="my-1 border-t" />

      <button
        v-if="props.canManage"
        type="button"
        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
        role="menuitem"
        @click="choose('delete')"
      >
        <Icon name="lucide:trash-2" class="size-4" />
        Удалить
      </button>

      <p v-if="!props.canManage" class="px-3 py-2 text-xs text-muted-foreground">
        Недостаточно прав
      </p>
    </div>
  </div>
</template>
