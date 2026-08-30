<script setup lang="ts">
import { PERMISSION, STAGE_STATUS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

interface Stage {
  id: string
  name: string
  order: number
  status: string
  progress: number
  weight: number
  deadline: string | null
  assignee: { id: string, firstName: string, lastName: string } | null
  department: { id: string, name: string } | null
  _count: { tasks: number, shotStages: number }
}

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ (event: 'changed'): void }>()

const auth = useAuthStore()
const canEdit = computed(() => auth.can(PERMISSION.PRODUCTION_MANAGE))

const { data, pending, error, refresh } = await useFetch<{ data: Stage[] }>('/api/stages', {
  query: { projectId: props.projectId },
  credentials: 'include',
  default: () => ({ data: [] })
})

const stages = computed(() => data.value?.data ?? [])
const savingId = ref('')
const errorMessage = ref('')

const STATUSES = Object.values(STAGE_STATUS)

const summary = computed(() => ({
  total: stages.value.length,
  done: stages.value.filter(s => s.status === 'DONE').length,
  blocked: stages.value.filter(s => s.status === 'BLOCKED').length
}))

async function patchStage(stage: Stage, payload: Record<string, unknown>) {
  savingId.value = stage.id
  errorMessage.value = ''
  try {
    await apiRequest('/api/stages/' + stage.id, { method: 'PATCH', body: payload })
    await refresh()
    // Progress rolls up to the project, so the header needs to reload too.
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось обновить стадию')
  } finally {
    savingId.value = ''
  }
}
</script>

<template>
  <section class="rounded-xl border bg-card">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div>
        <h2 class="text-sm font-medium">Пайплайн</h2>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ summary.done }} из {{ summary.total }} завершено
          <span v-if="summary.blocked > 0" class="text-destructive">
            · {{ summary.blocked }} заблокировано
          </span>
        </p>
      </div>
      <p v-if="canEdit" class="text-xs text-muted-foreground">
        Прогресс проекта пересчитывается автоматически
      </p>
    </header>

    <p v-if="errorMessage" role="alert" class="border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive">
      {{ errorMessage }}
    </p>

    <div v-if="error" class="px-5 py-14 text-center">
      <p class="text-sm text-muted-foreground">Не удалось загрузить пайплайн</p>
      <button type="button" class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="refresh()">
        Повторить
      </button>
    </div>

    <div v-else-if="pending && stages.length === 0" class="divide-y">
      <div v-for="n in 6" :key="n" class="flex items-center gap-4 px-5 py-3.5">
        <div class="h-4 w-6 rounded bg-muted" />
        <div class="h-4 flex-1 rounded bg-muted" />
        <div class="h-4 w-28 rounded bg-muted" />
      </div>
    </div>

    <div v-else-if="stages.length === 0" class="grid place-items-center px-6 py-14 text-center">
      <Icon name="lucide:git-branch" class="size-7 text-muted-foreground/50" />
      <h3 class="mt-3 text-sm font-medium">Пайплайн не настроен</h3>
      <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Проект создан без шаблона — стадии можно добавить вручную.
      </p>
    </div>

    <ol v-else class="divide-y">
      <li
        v-for="stage in stages"
        :key="stage.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
        :class="savingId === stage.id ? 'opacity-60' : ''"
      >
        <span class="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">{{ stage.order }}</span>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ stage.name }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            вес {{ stage.weight }}
            <template v-if="stage.department"> · {{ stage.department.name }}</template>
            <template v-if="stage._count.tasks > 0"> · {{ stage._count.tasks }} задач</template>
          </p>
        </div>

        <div class="flex items-center gap-3">
          <input
            v-if="canEdit"
            type="range"
            min="0"
            max="100"
            step="5"
            :value="stage.progress"
            :disabled="stage.status === 'DONE' || savingId === stage.id"
            class="h-1.5 w-28 cursor-pointer accent-primary disabled:cursor-not-allowed"
            :aria-label="'Прогресс стадии ' + stage.name"
            @change="patchStage(stage, { progress: Number(($event.target as HTMLInputElement).value) })"
          >
          <span class="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {{ stage.progress }}%
          </span>

          <select
            v-if="canEdit"
            :value="stage.status"
            :disabled="savingId === stage.id"
            class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
            :aria-label="'Статус стадии ' + stage.name"
            @change="patchStage(stage, { status: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="s in STATUSES" :key="s" :value="s">{{ s.split('_').join(' ') }}</option>
          </select>
          <StatusBadge v-else :status="stage.status" />
        </div>
      </li>
    </ol>
  </section>
</template>
