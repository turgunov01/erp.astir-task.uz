<script setup lang="ts">
import { PRODUCTION_STATUS_LABEL, labelOf } from '~/utils/labels'
import { PERMISSION, PRODUCTION_STATUS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

interface Episode {
  id: string
  number: number
  title: string
  status: string
  progress: number
  deadline: string | null
  _count: { scenes: number, shots: number, tasks: number }
}

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ (event: 'changed'): void }>()

const { t } = useI18n()
const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.PRODUCTION_MANAGE))

const { data, pending, error, refresh } = await useFetch<{ data: Episode[] }>('/api/episodes', {
  query: { projectId: props.projectId, limit: 100 },
  credentials: 'include',
  default: () => ({ data: [] })
})

const episodes = computed(() => data.value?.data ?? [])

const showForm = ref(false)
const submitting = ref(false)
const busyId = ref('')
const errorMessage = ref('')
const form = reactive({ title: '', deadline: '' })

const STATUSES = Object.values(PRODUCTION_STATUS)

async function createEpisode() {
  errorMessage.value = ''
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      projectId: props.projectId,
      title: form.title
    }
    if (form.deadline) payload.deadline = form.deadline
    // Number is omitted on purpose: the API assigns the next free one.
    await apiRequest('/api/episodes', { method: 'POST', body: payload })
    form.title = ''
    form.deadline = ''
    showForm.value = false
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, t('projects.episodes.createFailed'))
  } finally {
    submitting.value = false
  }
}

async function changeStatus(episode: Episode, status: string) {
  busyId.value = episode.id
  errorMessage.value = ''
  try {
    await apiRequest('/api/episodes/' + episode.id, { method: 'PATCH', body: { status } })
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, t('projects.episodes.updateFailed'))
  } finally {
    busyId.value = ''
  }
}

async function removeEpisode(episode: Episode) {
  busyId.value = episode.id
  errorMessage.value = ''
  try {
    await apiRequest('/api/episodes/' + episode.id, { method: 'DELETE' })
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, t('projects.episodes.deleteFailed'))
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
        <h2 class="text-sm font-medium">{{ t('projects.detail.tabs.episodes') }}</h2>
        <p class="mt-1 text-xs text-muted-foreground">{{ countLabel(episodes.length, 'projects.count.episodes') }}</p>
      </div>
      <Button v-if="canManage" size="sm" class="h-8" @click="showForm = !showForm">
        <Icon :name="showForm ? 'lucide:x' : 'lucide:plus'" class="mr-1.5 size-3.5" />
        {{ showForm ? t('common.actions.cancel') : t('projects.episodes.add') }}
      </Button>
    </header>

    <p
      v-if="errorMessage"
      role="alert"
      class="border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive"
    >
      {{ errorMessage }}
    </p>

    <form v-if="showForm" class="space-y-4 border-b bg-muted/20 px-5 py-5" @submit.prevent="createEpisode">
      <div class="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <div class="space-y-1.5">
          <Label for="ep-title">{{ t('projects.form.name') }}</Label>
          <Input id="ep-title" v-model="form.title" required maxlength="200" class="h-9" :placeholder="t('projects.episodes.namePlaceholder')" />
          <p class="pt-0.5 text-xs text-muted-foreground">{{ t('projects.episodes.numberHint') }}</p>
        </div>
        <div class="space-y-1.5">
          <Label for="ep-deadline">{{ t('projects.form.deadline') }}</Label>
          <Input id="ep-deadline" v-model="form.deadline" type="date" class="h-9" />
        </div>
      </div>
      <Button type="submit" size="sm" :disabled="submitting">
        {{ submitting ? t('projects.form.creating') : t('projects.episodes.create') }}
      </Button>
    </form>

    <div v-if="error" class="px-5 py-14 text-center">
      <p class="text-sm text-muted-foreground">{{ t('projects.episodes.loadFailed') }}</p>
      <button type="button" class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="refresh()">
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <div v-else-if="pending && episodes.length === 0" class="divide-y">
      <div v-for="n in 3" :key="n" class="flex items-center gap-4 px-5 py-3.5">
        <div class="h-4 w-10 rounded bg-muted" />
        <div class="h-4 flex-1 rounded bg-muted" />
      </div>
    </div>

    <div v-else-if="episodes.length === 0" class="grid place-items-center px-6 py-14 text-center">
      <Icon name="lucide:tv" class="size-7 text-muted-foreground/50" />
      <h3 class="mt-3 text-sm font-medium">{{ t('projects.episodes.emptyTitle') }}</h3>
      <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">
        {{ t('projects.episodes.emptyBody') }}
      </p>
    </div>

    <ul v-else class="divide-y">
      <li
        v-for="episode in episodes"
        :key="episode.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
        :class="busyId === episode.id ? 'opacity-60' : ''"
      >
        <span class="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums">
          EP{{ pad(episode.number) }}
        </span>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ episode.title }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ countLabel(episode._count.scenes, 'projects.count.scenes') }} · {{ countLabel(episode._count.shots, 'projects.count.shots') }}
          </p>
        </div>

        <ProgressBar :value="episode.progress" />

        <select
          v-if="canManage"
          :value="episode.status"
          :disabled="busyId === episode.id"
          class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          :aria-label="t('projects.episodes.statusOf', { name: episode.title })"
          @change="changeStatus(episode, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="s in STATUSES" :key="s" :value="s">{{ labelOf(PRODUCTION_STATUS_LABEL, s) }}</option>
        </select>
        <StatusBadge v-else :status="episode.status" />

        <button
          v-if="canManage"
          type="button"
          class="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
          :disabled="busyId === episode.id"
          :aria-label="t('projects.episodes.deleteOf', { name: episode.title })"
          @click="removeEpisode(episode)"
        >
          <Icon name="lucide:trash-2" class="size-3.5" />
        </button>
      </li>
    </ul>
  </section>
</template>
