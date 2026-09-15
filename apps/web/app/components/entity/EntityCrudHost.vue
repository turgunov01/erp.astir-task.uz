<script setup lang="ts">
import type { EntityCrud } from '~/composables/useEntityCrud'

/**
 * The overlays every table needs: the create/edit panel, the delete
 * confirmation, and the error banner for actions that failed.
 *
 * Pages render the table and the toolbar; this renders everything that floats
 * above them, so the markup is written once instead of on every page.
 */
const props = defineProps<{
  crud: EntityCrud
  /** Omitted when the page edits through its own route rather than a panel. */
  config?: EntityFormConfig
  /**
   * What deletion actually costs on this table.
   *
   * The default mentions archiving, which only tables that have an archive can
   * offer; a finance row has none, and promising one would be a lie.
   */
  deleteDetail?: string
}>()

const DEFAULT_DELETE_DETAIL =
  'Запись исчезнет из списков. Вернуть её через интерфейс будет нельзя — ' +
  'для обратимого скрытия есть архивирование.'
</script>

<template>
  <div>
    <p
      v-if="props.crud.errorMessage"
      role="alert"
      class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {{ props.crud.errorMessage }}
    </p>

    <EntityFormPanel
      v-if="props.crud.formOpen && props.config"
      :config="props.config"
      :record="props.crud.editing"
      @close="props.crud.closeForm()"
      @saved="props.crud.saved($event)"
    />

    <ConfirmDialog
      v-if="props.crud.deleteTarget"
      title="Удаление"
      :message="props.crud.deleteMessage"
      :detail="props.deleteDetail ?? DEFAULT_DELETE_DETAIL"
      confirm-label="Удалить"
      :pending="props.crud.deleting"
      @confirm="props.crud.confirmDelete()"
      @cancel="props.crud.cancelDelete()"
    />
  </div>
</template>
