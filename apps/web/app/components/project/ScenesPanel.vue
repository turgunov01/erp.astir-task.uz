<script setup lang="ts">
import { PERMISSION, PRODUCTION_STATUS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

interface Scene {
  id: string
  sceneNumber: number
  name: string
  status: string
  progress: number
  episode: { id: string, number: number, title: string } | null
  _count: { shots: number, tasks: number }
}

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ (event: 'changed'): void }>()

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.PRODUCTION_MANAGE))

const episodeFilter = ref('')

const { data, pending, error, refresh } = await useFetch<{ data: Scene[] }>('/api/scenes', {
  query: computed(() => ({
    projectId: props.projectId,
    limit: 100,
    episodeId: episodeFilter.value || undefined
  })),
  credentials: 'include',
  default: () => ({ data: [] })
})

const { data: episodeData } = await useFetch<{
  data: Array<{ id: string, number: number, title: string }>
}>('/api/episodes', {
  query: { projectId: props.projectId, limit: 100 },
  credentials: 'include',
  default: () => ({ data: [] })
})

const scenes = computed(() => data.value?.data ?? [])
const episodes = computed(() => episodeData.value?.data ?? [])

const showForm = ref(false)
const submitting = ref(false)
const busyId = ref('')
const errorMessage = ref('')
const form = reactive({ name: '', episodeId: '' })

const STATUSES = Object.values(PRODUCTION_STATUS)

async function createScene() {
  errorMessage.value = ''
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      projectId: props.projectId,
      name: form.name
    }
    if (form.episodeId) payload.episodeId = form.episodeId
    // Scene number is omitted: the API assigns the next free one in the episode.
    await apiRequest('/api/scenes', { method: 'POST', body: payload })
    form.name = ''
    showForm.value = false
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось создать сцену')
  } finally {
    submitting.value = false
  }
}

async function changeStatus(scene: Scene, status: string) {
  busyId.value = scene.id
  errorMessage.value = ''
  try {
    await apiRequest('/api/scenes/' + scene.id, { method: 'PATCH', body: { status } })
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось обновить сцену')
  } finally {
    busyId.value = ''
  }
}

async function removeScene(scene: Scene) {
  busyId.value = scene.id
  errorMessage.value = ''
  try {
    await apiRequest('/api/scenes/' + scene.id, { method: 'DELETE' })
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось удалить сцену')
  } finally {
    busyId.value = ''
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}
</script>

<template>
  <section class="rounded-xl border bg-card">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div>
        <h2 class="text-sm font-medium">Сцены</h2>
        <p class="mt-1 text-xs text-muted-foreground">{{ scenes.length }} сцен(ы)</p>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-model="episodeFilter"
          class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          aria-label="Фильтр по эпизоду"
        >
          <option value="">Все эпизоды</option>
          <option v-for="ep in episodes" :key="ep.id" :value="ep.id">
            EP{{ pad(ep.number) }} — {{ ep.title }}
          </option>
        </select>
        <Button v-if="canManage" size="sm" class="h-8" @click="showForm = !showForm">
          <Icon :name="showForm ? 'lucide:x' : 'lucide:plus'" class="mr-1.5 size-3.5" />
          {{ showForm ? 'Отмена' : 'Сцена' }}
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

    <form v-if="showForm" class="space-y-4 border-b bg-muted/20 px-5 py-5" @submit.prevent="createScene">
      <div class="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <div class="space-y-1.5">
          <Label for="sc-name">Название</Label>
          <Input
            id="sc-name"
            v-model="form.name"
            required
            maxlength="200"
            class="h-9"
            placeholder="Погоня по крышам"
          />
          <p class="pt-0.5 text-xs text-muted-foreground">
            Номер сцены присваивается автоматически.
          </p>
        </div>
        <div class="space-y-1.5">
          <Label for="sc-episode">Эпизод</Label>
          <select
            id="sc-episode"
            v-model="form.episodeId"
            class="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
            <option value="">Без эпизода</option>
            <option v-for="ep in episodes" :key="ep.id" :value="ep.id">
              EP{{ pad(ep.number) }} — {{ ep.title }}
            </option>
          </select>
        </div>
      </div>
      <Button type="submit" size="sm" :disabled="submitting">
        {{ submitting ? 'Создание...' : 'Создать сцену' }}
      </Button>
    </form>

    <div v-if="error" class="px-5 py-14 text-center">
      <p class="text-sm text-muted-foreground">Не удалось загрузить сцены</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <div v-else-if="pending && scenes.length === 0" class="divide-y">
      <div v-for="n in 3" :key="n" class="flex items-center gap-4 px-5 py-3.5">
        <div class="h-4 w-16 rounded bg-muted" />
        <div class="h-4 flex-1 rounded bg-muted" />
      </div>
    </div>

    <div v-else-if="scenes.length === 0" class="grid place-items-center px-6 py-14 text-center">
      <Icon name="lucide:film" class="size-7 text-muted-foreground/50" />
      <h3 class="mt-3 text-sm font-medium">Сцен пока нет</h3>
      <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Сцена группирует шоты внутри эпизода и задаёт их нумерацию.
      </p>
    </div>

    <ul v-else class="divide-y">
      <li
        v-for="scene in scenes"
        :key="scene.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
        :class="busyId === scene.id ? 'opacity-60' : ''"
      >
        <span class="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums">
          <template v-if="scene.episode">EP{{ pad(scene.episode.number) }}_</template>SC{{ pad(scene.sceneNumber) }}
        </span>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ scene.name }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ scene._count.shots }} шотов · {{ scene._count.tasks }} задач
          </p>
        </div>

        <ProgressBar :value="scene.progress" />

        <select
          v-if="canManage"
          :value="scene.status"
          :disabled="busyId === scene.id"
          class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          :aria-label="'Статус сцены ' + scene.name"
          @change="changeStatus(scene, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="s in STATUSES" :key="s" :value="s">{{ s.split('_').join(' ') }}</option>
        </select>
        <StatusBadge v-else :status="scene.status" />

        <button
          v-if="canManage"
          type="button"
          class="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
          :disabled="busyId === scene.id"
          :aria-label="'Удалить сцену ' + scene.name"
          @click="removeScene(scene)"
        >
          <Icon name="lucide:trash-2" class="size-3.5" />
        </button>
      </li>
    </ul>
  </section>
</template>
