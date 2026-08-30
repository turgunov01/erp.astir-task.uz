<script setup lang="ts">
import { useTaskPanels } from '~/composables/useTaskPanels'

const props = defineProps<{ id: string, offset: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { closeAll } = useTaskPanels()

interface RenderJob {
  id: string
  status: string
  progress: number
  priority: string
  startFrame: number | null
  endFrame: number | null
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  project: { id: string, code: string, name: string } | null
  shot: { id: string, code: string } | null
  version: { id: string, label: string, status: string, fileUrl: string | null } | null
  node: { id: string, name: string, isOnline: boolean } | null
  submittedBy: { firstName: string, lastName: string } | null
}

const { data, pending, error, refresh } = await useFetch<{ data: RenderJob }>(
  () => '/api/render/' + props.id,
  { credentials: 'include' }
)

const job = computed(() => data.value?.data)

const frameCount = computed(() => {
  const item = job.value
  if (!item || item.startFrame == null || item.endFrame == null) return null
  return item.endFrame - item.startFrame + 1
})

/** Wall-clock render time, once the job has actually started. */
const duration = computed(() => {
  const item = job.value
  if (!item?.startedAt) return '—'
  const end = item.completedAt ? new Date(item.completedAt) : new Date()
  const minutes = Math.round((end.getTime() - new Date(item.startedAt).getTime()) / 60000)
  if (minutes < 60) return minutes + ' мин'
  return Math.floor(minutes / 60) + ' ч ' + (minutes % 60) + ' мин'
})
</script>

<template>
  <DetailPanel
    :title="job?.shot?.code ?? 'Задание рендера'"
    subtitle="Очередь рендера"
    :offset="props.offset"
    :pending="pending"
    :error="Boolean(error)"
    panel-label="Детали задания рендера"
    @close="emit('close')"
    @retry="refresh()"
  >
    <div v-if="job">
      <div class="flex flex-wrap items-center gap-2 border-b px-5 py-3.5">
        <StatusBadge :status="job.status" />
        <span class="rounded-md bg-secondary px-2 py-0.5 text-xs">
          {{ PRIORITY_LABEL[job.priority] ?? job.priority }}
        </span>
      </div>

      <section class="border-b px-5 py-4">
        <div class="flex items-baseline justify-between">
          <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Прогресс
          </h3>
          <span class="text-sm font-medium tabular-nums">{{ job.progress }}%</span>
        </div>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            class="h-full rounded-full"
            :class="job.status === 'FAILED' ? 'bg-destructive' : 'bg-primary'"
            :style="{ width: Math.min(100, Math.max(0, job.progress)) + '%' }"
          />
        </div>
      </section>

      <section
        v-if="job.errorMessage"
        class="border-b border-destructive/30 bg-destructive/5 px-5 py-4"
      >
        <h3 class="text-xs font-medium uppercase tracking-wider text-destructive">
          Ошибка рендера
        </h3>
        <p class="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-destructive">
          {{ job.errorMessage }}
        </p>
      </section>

      <dl class="divide-y">
        <DetailRow label="Статус">
          {{ RENDER_STATUS_LABEL[job.status] ?? job.status }}
        </DetailRow>
        <DetailRow label="Проект">
          <NuxtLink
            v-if="job.project"
            :to="'/projects/' + job.project.id"
            class="hover:underline"
            @click="closeAll()"
          >
            {{ job.project.code }} · {{ job.project.name }}
          </NuxtLink>
          <span v-else class="text-muted-foreground">—</span>
        </DetailRow>
        <DetailRow label="Шот">
          <NuxtLink
            v-if="job.shot"
            :to="'/shots/' + job.shot.id"
            class="font-mono hover:underline"
            @click="closeAll()"
          >
            {{ job.shot.code }}
          </NuxtLink>
          <span v-else class="text-muted-foreground">—</span>
        </DetailRow>
        <DetailRow label="Версия">
          <span v-if="job.version">{{ job.version.label }}</span>
          <span v-else class="text-muted-foreground">—</span>
        </DetailRow>
        <DetailRow label="Узел">
          <span v-if="job.node" class="inline-flex items-center gap-1.5">
            <span
              class="size-2 rounded-full"
              :class="job.node.isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
            />
            {{ job.node.name }}
            <span class="text-xs text-muted-foreground">
              {{ job.node.isOnline ? 'онлайн' : 'офлайн' }}
            </span>
          </span>
          <span v-else class="text-muted-foreground">не назначен</span>
        </DetailRow>
        <DetailRow label="Кадры">
          <span v-if="frameCount !== null" class="tabular-nums">
            {{ job.startFrame }}–{{ job.endFrame }} ({{ frameCount }})
          </span>
          <span v-else class="text-muted-foreground">—</span>
        </DetailRow>
        <DetailRow label="Поставил">{{ fullName(job.submittedBy) }}</DetailRow>
        <DetailRow label="Начат">{{ formatDateTime(job.startedAt) }}</DetailRow>
        <DetailRow label="Завершён">{{ formatDateTime(job.completedAt) }}</DetailRow>
        <DetailRow label="Длительность">{{ duration }}</DetailRow>
        <DetailRow label="Создан">{{ formatDateTime(job.createdAt) }}</DetailRow>
      </dl>
    </div>
  </DetailPanel>
</template>
