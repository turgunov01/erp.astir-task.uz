<script setup lang="ts">
import { PERMISSION, PRODUCTION_STATUS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'

interface Shot {
  id: string
  code: string
  shotNumber: number
  name: string | null
  status: string
  progress: number
  fps: number
  deadline: string | null
  episode: { id: string, number: number } | null
  scene: { id: string, sceneNumber: number, name: string } | null
  assignee: { id: string, firstName: string, lastName: string } | null
  _count: { tasks: number, versions: number }
}

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ (event: 'changed'): void }>()

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.PRODUCTION_MANAGE))

const sceneFilter = ref('')
const statusFilter = ref('')

const { data, pending, error, refresh } = await useFetch<{ data: Shot[] }>('/api/shots', {
  query: computed(() => ({
    projectId: props.projectId,
    limit: 100,
    sceneId: sceneFilter.value || undefined,
    status: statusFilter.value || undefined
  })),
  credentials: 'include',
  default: () => ({ data: [] })
})

const { data: sceneData } = await useFetch<{
  data: Array<{ id: string, sceneNumber: number, name: string, episode: { number: number } | null }>
}>('/api/scenes', {
  query: { projectId: props.projectId, limit: 100 },
  credentials: 'include',
  default: () => ({ data: [] })
})

const shots = computed(() => data.value?.data ?? [])
const scenes = computed(() => sceneData.value?.data ?? [])

const showForm = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const form = reactive({ sceneId: '', count: 1 })

const STATUSES = Object.values(PRODUCTION_STATUS)

/**
 * Shots are usually created in runs, so the form takes a count and the API
 * assigns consecutive numbers and codes for each one.
 */
async function createShots() {
  errorMessage.value = ''
  submitting.value = true
  try {
    for (let index = 0; index < form.count; index += 1) {
      const payload: Record<string, unknown> = { projectId: props.projectId }
      if (form.sceneId) payload.sceneId = form.sceneId
      await apiRequest('/api/shots', { method: 'POST', body: payload })
    }
    form.count = 1
    showForm.value = false
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось создать шот')
  } finally {
    submitting.value = false
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function sceneLabel(scene: { sceneNumber: number, name: string, episode: { number: number } | null }) {
  const prefix = scene.episode ? 'EP' + pad(scene.episode.number) + '_' : ''
  return prefix + 'SC' + pad(scene.sceneNumber) + ' — ' + scene.name
}
</script>

<template>
  <section class="rounded-xl border bg-card">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div>
        <h2 class="text-sm font-medium">Шоты</h2>
        <p class="mt-1 text-xs text-muted-foreground">{{ shots.length }} шот(ов)</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="sceneFilter"
          class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          aria-label="Фильтр по сцене"
        >
          <option value="">Все сцены</option>
          <option v-for="scene in scenes" :key="scene.id" :value="scene.id">
            {{ sceneLabel(scene) }}
          </option>
        </select>
        <select
          v-model="statusFilter"
          class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          aria-label="Фильтр по статусу"
        >
          <option value="">Все статусы</option>
          <option v-for="s in STATUSES" :key="s" :value="s">{{ s.split('_').join(' ') }}</option>
        </select>
        <Button
          v-if="canManage"
          size="sm"
          class="h-8"
          :disabled="scenes.length === 0"
          @click="showForm = !showForm"
        >
          <Icon :name="showForm ? 'lucide:x' : 'lucide:plus'" class="mr-1.5 size-3.5" />
          {{ showForm ? 'Отмена' : 'Шоты' }}
        </Button>
      </div>
    </header>

    <p
      v-if="errorMessage"
      role="alert"
      class="border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive"
    >
      {{ errorMessage }}
    </p>

    <form v-if="showForm" class="space-y-4 border-b bg-muted/20 px-5 py-5" @submit.prevent="createShots">
      <div class="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <div class="space-y-1.5">
          <Label for="shot-scene">Сцена</Label>
          <select
            id="shot-scene"
            v-model="form.sceneId"
            required
            class="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
            <option value="" disabled>Выберите сцену</option>
            <option v-for="scene in scenes" :key="scene.id" :value="scene.id">
              {{ sceneLabel(scene) }}
            </option>
          </select>
        </div>
        <div class="space-y-1.5">
          <Label for="shot-count">Сколько создать</Label>
          <input
            id="shot-count"
            v-model.number="form.count"
            type="number"
            min="1"
            max="50"
            class="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
          >
          <p class="pt-0.5 text-xs text-muted-foreground">
            Коды вида EP01_SC01_SH001 и 22 стадии пайплайна создаются автоматически.
          </p>
        </div>
      </div>
      <Button type="submit" size="sm" :disabled="submitting || !form.sceneId">
        {{ submitting ? 'Создание...' : 'Создать' }}
      </Button>
    </form>

    <div v-if="error" class="px-5 py-14 text-center">
      <p class="text-sm text-muted-foreground">Не удалось загрузить шоты</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <div v-else-if="pending && shots.length === 0" class="divide-y">
      <div v-for="n in 4" :key="n" class="flex items-center gap-4 px-5 py-3.5">
        <div class="h-4 w-32 rounded bg-muted" />
        <div class="h-4 flex-1 rounded bg-muted" />
      </div>
    </div>

    <div v-else-if="shots.length === 0" class="grid place-items-center px-6 py-14 text-center">
      <Icon name="lucide:camera" class="size-7 text-muted-foreground/50" />
      <h3 class="mt-3 text-sm font-medium">Шотов пока нет</h3>
      <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Шот — основная производственная единица: у каждого свой набор стадий пайплайна.
      </p>
    </div>

    <ul v-else class="divide-y">
      <li
        v-for="shot in shots"
        :key="shot.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
      >
        <span class="shrink-0 rounded-md bg-secondary px-2 py-0.5 font-mono text-xs font-medium">
          {{ shot.code }}
        </span>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">
            {{ shot.name || shot.scene?.name || 'Без названия' }}
          </p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ shot.fps }} fps · {{ shot._count.tasks }} задач · {{ shot._count.versions }} версий
            <template v-if="shot.assignee">
              · {{ shot.assignee.firstName }} {{ shot.assignee.lastName }}
            </template>
          </p>
        </div>

        <ProgressBar :value="shot.progress" />
        <StatusBadge :status="shot.status" />
      </li>
    </ul>
  </section>
</template>
