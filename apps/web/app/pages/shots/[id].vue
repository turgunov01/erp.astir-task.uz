<script setup lang="ts">
import { PERMISSION, PRODUCTION_STATUS, STAGE_STATUS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const auth = useAuthStore()
const shotId = computed(() => String(route.params.id))

interface ShotStage {
  id: string
  stageId: string
  status: string
  progress: number
  startedAt: string | null
  completedAt: string | null
  stage: { id: string, name: string, order: number, weight: number }
  assignee: { id: string, firstName: string, lastName: string } | null
}

interface ShotDetail {
  id: string
  code: string
  name: string | null
  description: string | null
  status: string
  progress: number
  fps: number
  startFrame: number | null
  endFrame: number | null
  duration: number | null
  deadline: string | null
  project: { id: string, code: string, name: string } | null
  episode: { id: string, number: number, title: string } | null
  scene: { id: string, sceneNumber: number, name: string } | null
  assignee: { id: string, firstName: string, lastName: string } | null
  stages: ShotStage[]
  _count: { tasks: number, versions: number }
}

const { data, pending, error, refresh } = await useFetch<{ data: ShotDetail }>(
  () => '/api/shots/' + shotId.value,
  { credentials: 'include' }
)

const shot = computed(() => data.value?.data)

if (!pending.value && !shot.value) {
  throw createError({ statusCode: 404, statusMessage: 'Шот не найден' })
}

useHead({ title: computed(() => (shot.value?.code ?? 'Шот') + ' — Aster ERP') })

// An artist owns their shot stages, unlike the project-level pipeline.
const canEditStages = computed(() => auth.can(PERMISSION.TASK_UPDATE))

const busyStageId = ref('')
const errorMessage = ref('')

const STAGE_STATUSES = Object.values(STAGE_STATUS)

const summary = computed(() => {
  const stages = shot.value?.stages ?? []
  return {
    total: stages.length,
    done: stages.filter(s => s.status === 'DONE').length,
    active: stages.filter(s => s.status === 'IN_PROGRESS' || s.status === 'REVIEW').length,
    blocked: stages.filter(s => s.status === 'BLOCKED').length
  }
})

/** Every change rolls up: shot to scene to episode to project (spec 56). */
async function patchStage(stage: ShotStage, payload: Record<string, unknown>) {
  busyStageId.value = stage.stageId
  errorMessage.value = ''
  try {
    await apiRequest('/api/shots/' + shotId.value + '/stages/' + stage.stageId, {
      method: 'PATCH',
      body: payload
    })
    await refresh()
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось обновить стадию')
  } finally {
    busyStageId.value = ''
  }
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

function frameRange(target: ShotDetail) {
  if (target.startFrame == null || target.endFrame == null) return '—'
  const frames = target.endFrame - target.startFrame + 1
  return target.startFrame + '–' + target.endFrame + ' (' + frames + ' кадров)'
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-6 py-8">
    <NuxtLink
      to="/shots"
      class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <Icon name="lucide:arrow-left" class="size-3.5" />
      Ко всем шотам
    </NuxtLink>

    <div v-if="error" class="mt-8 rounded-xl border bg-card px-6 py-16 text-center">
      <Icon name="lucide:triangle-alert" class="size-8 text-destructive" />
      <p class="mt-3 text-sm font-medium">Не удалось загрузить шот</p>
      <button
        type="button"
        class="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <template v-else-if="shot">
      <header class="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <NuxtLink v-if="shot.project" :to="'/projects/' + shot.project.id" class="hover:text-foreground hover:underline">
              {{ shot.project.code }}
            </NuxtLink>
            <template v-if="shot.episode">
              <span>/</span><span>EP{{ String(shot.episode.number).padStart(2, '0') }}</span>
            </template>
            <template v-if="shot.scene">
              <span>/</span><span>{{ shot.scene.name }}</span>
            </template>
          </p>
          <h1 class="mt-1.5 font-mono text-2xl font-semibold tracking-tight">{{ shot.code }}</h1>
          <p v-if="shot.name" class="mt-1 text-sm text-muted-foreground">{{ shot.name }}</p>
        </div>
        <StatusBadge :status="shot.status" />
      </header>

      <section class="mt-6 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">Прогресс</p>
          <p class="mt-1.5 text-2xl font-semibold tabular-nums">{{ shot.progress }}%</p>
          <ProgressBar class="mt-2" :value="shot.progress" />
        </div>
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">Стадии</p>
          <p class="mt-1.5 text-lg font-medium tabular-nums">
            {{ summary.done }} / {{ summary.total }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ summary.active }} в работе
            <span v-if="summary.blocked > 0" class="text-destructive">
              · {{ summary.blocked }} заблокировано
            </span>
          </p>
        </div>
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">Кадры</p>
          <p class="mt-1.5 text-sm font-medium">{{ frameRange(shot) }}</p>
          <p class="mt-1 text-xs text-muted-foreground">{{ shot.fps }} fps</p>
        </div>
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">Исполнитель</p>
          <p class="mt-1.5 text-sm font-medium">
            {{ shot.assignee ? shot.assignee.firstName + ' ' + shot.assignee.lastName : 'не назначен' }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">дедлайн {{ formatDate(shot.deadline) }}</p>
        </div>
      </section>

      <p
        v-if="errorMessage"
        role="alert"
        class="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
      >
        {{ errorMessage }}
      </p>

      <section class="mt-6 rounded-xl border bg-card">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 class="text-sm font-medium">Производственные стадии</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              Прогресс шота считается по весам стадий и поднимается до сцены, эпизода и проекта
            </p>
          </div>
        </header>

        <div v-if="shot.stages.length === 0" class="grid place-items-center px-6 py-14 text-center">
          <Icon name="lucide:git-branch" class="size-7 text-muted-foreground/50" />
          <h3 class="mt-3 text-sm font-medium">Стадии не назначены</h3>
          <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Шот создан до настройки пайплайна проекта.
          </p>
        </div>

        <ol v-else class="divide-y">
          <li
            v-for="item in shot.stages"
            :key="item.id"
            class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
            :class="busyStageId === item.stageId ? 'opacity-60' : ''"
          >
            <span class="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
              {{ item.stage.order }}
            </span>

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ item.stage.name }}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                вес {{ item.stage.weight }}
                <template v-if="item.assignee">
                  · {{ item.assignee.firstName }} {{ item.assignee.lastName }}
                </template>
                <template v-if="item.completedAt">
                  · завершена {{ formatDate(item.completedAt) }}
                </template>
              </p>
            </div>

            <input
              v-if="canEditStages"
              type="range"
              min="0"
              max="100"
              step="5"
              :value="item.progress"
              :disabled="item.status === 'DONE' || busyStageId === item.stageId"
              class="h-1.5 w-28 cursor-pointer accent-primary disabled:cursor-not-allowed"
              :aria-label="'Прогресс стадии ' + item.stage.name"
              @change="patchStage(item, { progress: Number(($event.target as HTMLInputElement).value) })"
            >
            <span class="w-9 text-right text-xs tabular-nums text-muted-foreground">
              {{ item.progress }}%
            </span>

            <select
              v-if="canEditStages"
              :value="item.status"
              :disabled="busyStageId === item.stageId"
              class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
              :aria-label="'Статус стадии ' + item.stage.name"
              @change="patchStage(item, { status: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="s in STAGE_STATUSES" :key="s" :value="s">
                {{ enumLabel(PRODUCTION_STATUS_LABEL, s) }}
              </option>
            </select>
            <StatusBadge v-else :status="item.status" />
          </li>
        </ol>
      </section>

      <section v-if="shot.description" class="mt-6 rounded-xl border bg-card p-5">
        <h2 class="text-sm font-medium">Описание</h2>
        <p class="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {{ shot.description }}
        </p>
      </section>
    </template>
  </div>
</template>
