<script setup lang="ts">
import { useTaskPanels } from '~/composables/useTaskPanels'

const props = defineProps<{ id: string, offset: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { openTask, closeAll } = useTaskPanels()

interface Revision {
  id: string
  round: number
  title: string
  description: string | null
  status: string
  priority: string
  deadline: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  project: { id: string, code: string, name: string } | null
  shot: { id: string, code: string } | null
  task: { id: string, title: string } | null
  version: { id: string, label: string, status: string } | null
  requestedBy: { firstName: string, lastName: string } | null
  assignedTo: { firstName: string, lastName: string } | null
}

const { data, pending, error, refresh } = await useFetch<{ data: Revision }>(
  () => '/api/revisions/' + props.id,
  { credentials: 'include' }
)

const revision = computed(() => data.value?.data)

const isOverdue = computed(() => {
  const item = revision.value
  if (!item?.deadline) return false
  return new Date(item.deadline) < new Date() &&
    !['COMPLETED', 'CANCELLED'].includes(item.status)
})
</script>

<template>
  <DetailPanel
    :title="revision?.title ?? 'Правка'"
    :subtitle="'Правка · раунд ' + (revision?.round ?? '—')"
    :offset="props.offset"
    :pending="pending"
    :error="Boolean(error)"
    panel-label="Детали правки"
    @close="emit('close')"
    @retry="refresh()"
  >
    <div v-if="revision">
      <div class="flex flex-wrap items-center gap-2 border-b px-5 py-3.5">
        <StatusBadge :status="revision.status" />
        <span class="rounded-md bg-secondary px-2 py-0.5 text-xs">
          {{ PRIORITY_LABEL[revision.priority] ?? revision.priority }}
        </span>
        <span
          v-if="isOverdue"
          class="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
        >
          Просрочена
        </span>
      </div>

      <section v-if="revision.description" class="border-b px-5 py-4">
        <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Описание
        </h3>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{{ revision.description }}</p>
      </section>

      <dl class="divide-y">
        <DetailRow label="Статус">
          {{ REVISION_STATUS_LABEL[revision.status] ?? revision.status }}
        </DetailRow>
        <DetailRow label="Раунд">{{ revision.round }}</DetailRow>
        <DetailRow label="Проект">
          <NuxtLink
            v-if="revision.project"
            :to="'/projects/' + revision.project.id"
            class="hover:underline"
            @click="closeAll()"
          >
            {{ revision.project.code }} · {{ revision.project.name }}
          </NuxtLink>
          <span v-else class="text-muted-foreground">—</span>
        </DetailRow>
        <DetailRow label="Шот">
          <NuxtLink
            v-if="revision.shot"
            :to="'/shots/' + revision.shot.id"
            class="font-mono hover:underline"
            @click="closeAll()"
          >
            {{ revision.shot.code }}
          </NuxtLink>
          <span v-else class="text-muted-foreground">—</span>
        </DetailRow>
        <DetailRow label="Задача">
          <button
            v-if="revision.task"
            type="button"
            class="text-left hover:underline"
            @click="openTask(revision.task.id)"
          >
            {{ revision.task.title }}
          </button>
          <span v-else class="text-muted-foreground">—</span>
        </DetailRow>
        <DetailRow label="Версия">
          <span v-if="revision.version">{{ revision.version.label }}</span>
          <span v-else class="text-muted-foreground">—</span>
        </DetailRow>
        <DetailRow label="Автор">{{ fullName(revision.requestedBy) }}</DetailRow>
        <DetailRow label="Исполнитель">{{ fullName(revision.assignedTo) }}</DetailRow>
        <DetailRow label="Срок">
          <span :class="isOverdue ? 'font-medium text-destructive' : ''">
            {{ formatDay(revision.deadline) }}
          </span>
        </DetailRow>
        <DetailRow label="Создана">{{ formatDateTime(revision.createdAt) }}</DetailRow>
        <DetailRow label="Обновлена">{{ formatDateTime(revision.updatedAt) }}</DetailRow>
        <DetailRow label="Завершена">{{ formatDateTime(revision.completedAt) }}</DetailRow>
      </dl>
    </div>
  </DetailPanel>
</template>
