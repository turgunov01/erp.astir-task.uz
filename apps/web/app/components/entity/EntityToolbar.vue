<script setup lang="ts">
import type { EntityCrud } from '~/composables/useEntityCrud'

/**
 * Table-level controls: create a row, and switch between the working set and
 * the archive.
 *
 * Placed by each page in its own header, because the surrounding layout
 * differs, but the controls themselves are identical everywhere.
 */
const props = withDefaults(defineProps<{
  crud: EntityCrud
  createLabel: string
  canManage?: boolean
  /** Page with its own create form; links there instead of opening the panel. */
  createTo?: string
}>(), { canManage: true })
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <div class="flex rounded-md border p-0.5" role="group" aria-label="Набор записей">
      <button
        type="button"
        class="rounded px-2.5 py-1 text-sm"
        :class="!props.crud.archivedView
          ? 'bg-secondary font-medium text-secondary-foreground'
          : 'text-muted-foreground hover:text-foreground'"
        :aria-pressed="!props.crud.archivedView"
        @click="props.crud.archivedView = false"
      >
        Активные
      </button>
      <button
        type="button"
        class="rounded px-2.5 py-1 text-sm"
        :class="props.crud.archivedView
          ? 'bg-secondary font-medium text-secondary-foreground'
          : 'text-muted-foreground hover:text-foreground'"
        :aria-pressed="props.crud.archivedView"
        @click="props.crud.archivedView = true"
      >
        Архив
      </button>
    </div>

    <NuxtLink
      v-if="props.canManage && props.createTo"
      :to="props.createTo"
      class="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90"
    >
      <Icon name="lucide:plus" class="size-4" />
      {{ props.createLabel }}
    </NuxtLink>

    <button
      v-else-if="props.canManage"
      type="button"
      class="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      @click="props.crud.openCreate()"
    >
      <Icon name="lucide:plus" class="size-4" />
      {{ props.createLabel }}
    </button>
  </div>
</template>
