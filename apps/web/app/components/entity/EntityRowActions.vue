<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'

/**
 * Per-row action menu: edit, archive or restore, delete.
 *
 * Lives in the last column of every table. The trigger is a button, so the
 * row-click handler that opens the detail panel ignores it. The menu itself
 * is portalled to the body: tables scroll sideways on narrow screens, and a
 * menu positioned inside that scroll container would be clipped by it.
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
  /**
   * Whether this table has an archive at all.
   *
   * Finance rows do not: a payment is either recorded or it was a mistake, and
   * offering to archive one would promise a place to find it again that the
   * API has no column for.
   */
  archivable?: boolean
}>(), { canManage: true, archivable: true })

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'archive'): void
  (e: 'unarchive'): void
  (e: 'delete'): void
}>()
</script>

<template>
  <div class="flex justify-end" data-row-ignore>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground disabled:opacity-40"
          :aria-label="'Действия' + (props.name ? ': ' + props.name : '')"
          :disabled="props.busy"
        >
          <Icon :name="props.busy ? 'lucide:loader' : 'lucide:ellipsis'" class="size-4" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" class="w-48">
        <DropdownMenuItem v-if="props.canManage && !props.archived" @select="emit('edit')">
          <Icon name="lucide:pencil" />
          Редактировать
        </DropdownMenuItem>

        <DropdownMenuItem
          v-if="props.canManage && props.archivable && !props.archived"
          @select="emit('archive')"
        >
          <Icon name="lucide:archive" />
          Архивировать
        </DropdownMenuItem>

        <DropdownMenuItem
          v-if="props.canManage && props.archivable && props.archived"
          @select="emit('unarchive')"
        >
          <Icon name="lucide:archive-restore" />
          Вернуть из архива
        </DropdownMenuItem>

        <DropdownMenuSeparator v-if="props.canManage" />

        <DropdownMenuItem v-if="props.canManage" variant="destructive" @select="emit('delete')">
          <Icon name="lucide:trash-2" />
          Удалить
        </DropdownMenuItem>

        <p v-if="!props.canManage" class="px-2 py-1.5 text-xs text-muted-foreground">
          Недостаточно прав
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
