<script setup lang="ts">
import { useTaskPanels, type Panel } from '~/composables/useTaskPanels'

/**
 * Renders the panel stack and owns everything shared between panels: the
 * scrim, the Escape key and body scroll locking.
 *
 * Mounted once in the layout, so any page can open a task panel without
 * shipping its own copy of the drawer.
 */
const { stack, closeTop, closeAll, isOpen } = useTaskPanels()

onMounted(() => {
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen.value) {
      event.stopPropagation()
      closeTop()
    }
  }
  window.addEventListener('keydown', handler)
  onBeforeUnmount(() => window.removeEventListener('keydown', handler))
})

// The page behind must not scroll while a panel is open.
watch(isOpen, open => {
  if (import.meta.client) document.body.style.overflow = open ? 'hidden' : ''
})
onBeforeUnmount(() => {
  if (import.meta.client) document.body.style.overflow = ''
})

/** Distance from the top of the stack: 0 is the panel in front. */
function offsetFor(index: number) {
  return stack.value.length - 1 - index
}

/** Index is part of the key so the same task opened twice stays two layers. */
function keyFor(panel: Panel, index: number) {
  if (panel.kind === 'task') return 'task-' + panel.id + '-' + index
  if (panel.kind === 'status') return 'status-' + panel.status + '-' + index
  if (panel.kind === 'review') return 'review-' + panel.id + '-' + index
  if (panel.kind === 'revision') return 'revision-' + panel.id + '-' + index
  if (panel.kind === 'render') return 'render-' + panel.id + '-' + index
  if (panel.kind === 'asset') return 'asset-' + panel.id + '-' + index
  if (panel.kind === 'day') return 'day-' + panel.date + '-' + index
  return 'panel-' + index
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50">
    <div class="drawer-scrim absolute inset-0 bg-black/30" @click="closeAll" />

    <!--
      Panels stay mounted underneath so their scroll position and loaded data
      survive while something is opened on top of them.
    -->
    <div class="pointer-events-none absolute inset-0">
      <template v-for="(panel, index) in stack" :key="keyFor(panel, index)">
        <div
          class="absolute inset-y-0 right-0 flex"
          :style="{ zIndex: 10 + index }"
          :aria-hidden="index !== stack.length - 1 ? 'true' : undefined"
        >
          <TaskDrawer
            v-if="panel.kind === 'task'"
            :task-id="panel.id"
            :offset="offsetFor(index)"
            @close="closeTop"
          />
          <ReviewDetailPanel
            v-else-if="panel.kind === 'review'"
            :id="panel.id"
            :offset="offsetFor(index)"
            @close="closeTop"
          />
          <DetailRevision
            v-else-if="panel.kind === 'revision'"
            :id="panel.id"
            :offset="offsetFor(index)"
            @close="closeTop"
          />
          <DetailRender
            v-else-if="panel.kind === 'render'"
            :id="panel.id"
            :offset="offsetFor(index)"
            @close="closeTop"
          />
          <DetailAsset
            v-else-if="panel.kind === 'asset'"
            :id="panel.id"
            :offset="offsetFor(index)"
            @close="closeTop"
          />
          <TaskStatusPanel
            v-else-if="panel.kind === 'status'"
            :status="panel.status"
            :project-id="panel.projectId"
            :offset="offsetFor(index)"
            @close="closeTop"
          />
          <TaskDayPanel
            v-else-if="panel.kind === 'day'"
            :date="panel.date"
            :project-id="panel.projectId"
            :assignee-id="panel.assigneeId"
            :priority="panel.priority"
            :offset="offsetFor(index)"
            @close="closeTop"
          />
        </div>
      </template>
    </div>
  </div>
</template>
