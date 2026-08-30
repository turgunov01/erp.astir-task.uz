<script setup lang="ts">
import { PRIORITY, TASK_STATUS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'

const props = defineProps<{
  /** Preselected project, used when opened from a project page. */
  projectId?: string
}>()

const emit = defineEmits<{ (e: 'close'): void, (e: 'created', id: string): void }>()

const submitting = ref(false)
const errorMessage = ref('')
const fieldErrors = ref<Record<string, string[]>>({})

const form = reactive({
  projectId: props.projectId ?? '',
  title: '',
  description: '',
  stageId: '',
  shotId: '',
  assigneeId: '',
  reviewerId: '',
  status: TASK_STATUS.BACKLOG as string,
  priority: PRIORITY.NORMAL as string,
  startDate: '',
  deadline: '',
  estimatedHours: ''
})

const { data: projectData } = await useFetch<{ data: Array<{ id: string, code: string, name: string }> }>(
  '/api/projects',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const { data: staffData } = await useFetch<{
  data: Array<{ userId: string, user: { firstName: string, lastName: string, role: string } }>
}>('/api/employees', { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) })

const projects = computed(() => projectData.value?.data ?? [])
const staff = computed(() => staffData.value?.data ?? [])
const reviewers = computed(() =>
  staff.value.filter(item =>
    ['ART_DIRECTOR', 'PROJECT_MANAGER', 'PRODUCER', 'ADMIN', 'OWNER'].includes(item.user.role)
  )
)

/**
 * Stages and shots depend on the chosen project, so they reload when it
 * changes and the stale selections are cleared — otherwise a task could be
 * filed against a stage belonging to a different project.
 */
const scopeQuery = computed(() => ({ projectId: form.projectId || undefined }))

const { data: stageData, refresh: refreshStages } = await useFetch<{
  data: Array<{ id: string, name: string, order: number }>
}>('/api/stages', {
  query: scopeQuery,
  credentials: 'include',
  default: () => ({ data: [] }),
  immediate: Boolean(props.projectId)
})

const { data: shotData, refresh: refreshShots } = await useFetch<{
  data: Array<{ id: string, code: string }>
}>('/api/shots', {
  query: computed(() => ({ projectId: form.projectId || undefined, limit: 100 })),
  credentials: 'include',
  default: () => ({ data: [] }),
  immediate: Boolean(props.projectId)
})

const stages = computed(() => stageData.value?.data ?? [])
const shots = computed(() => shotData.value?.data ?? [])

watch(() => form.projectId, async value => {
  form.stageId = ''
  form.shotId = ''
  if (!value) return
  await Promise.all([refreshStages(), refreshShots()])
})

const STATUSES = Object.values(TASK_STATUS)
const PRIORITIES = Object.values(PRIORITY)

const canSubmit = computed(() => form.title.trim().length >= 2 && Boolean(form.projectId))

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  errorMessage.value = ''
  fieldErrors.value = {}
  try {
    // Empty optional fields are omitted rather than sent as empty strings.
    const payload: Record<string, unknown> = {
      projectId: form.projectId,
      title: form.title.trim(),
      status: form.status,
      priority: form.priority
    }
    if (form.description.trim()) payload.description = form.description.trim()
    if (form.stageId) payload.stageId = form.stageId
    if (form.shotId) payload.shotId = form.shotId
    if (form.assigneeId) payload.assigneeId = form.assigneeId
    if (form.reviewerId) payload.reviewerId = form.reviewerId
    if (form.startDate) payload.startDate = form.startDate
    if (form.deadline) payload.deadline = form.deadline
    if (form.estimatedHours) payload.estimatedHours = Number(form.estimatedHours)

    const created = await apiRequest<{ data: { id: string } }>('/api/tasks', {
      method: 'POST',
      body: payload
    })
    emit('created', created.data.id)
    emit('close')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось создать задачу')
    const details = (err as { data?: { error?: { details?: Record<string, string[]> } } })
      ?.data?.error?.details
    if (details) fieldErrors.value = details
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') emit('close')
  }
  window.addEventListener('keydown', handler)
  onBeforeUnmount(() => window.removeEventListener('keydown', handler))
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex justify-end"
    role="dialog"
    aria-modal="true"
    aria-labelledby="create-task-title"
  >
    <div class="drawer-scrim absolute inset-0 bg-black/30" @click="emit('close')" />

    <aside class="drawer-panel relative flex h-full w-full max-w-xl flex-col border-l bg-background shadow-xl">
      <header class="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div>
          <h2 id="create-task-title" class="text-base font-semibold tracking-tight">
            Новая задача
          </h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Исполнитель получит уведомление о назначении
          </p>
        </div>
        <button
          type="button"
          class="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Закрыть"
          @click="emit('close')"
        >
          <Icon name="lucide:x" class="size-4" />
        </button>
      </header>

      <p
        v-if="errorMessage"
        role="alert"
        class="border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive"
      >
        {{ errorMessage }}
      </p>

      <form id="create-task-form" class="flex-1 space-y-6 overflow-y-auto px-5 py-5" @submit.prevent="submit">
        <div class="space-y-1.5">
          <label for="ct-title" class="text-sm font-medium">Название</label>
          <input
            id="ct-title"
            v-model="form.title"
            required
            maxlength="200"
            placeholder="Анимация SH014"
            class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
          >
          <p v-if="fieldErrors.title" class="pt-0.5 text-xs text-destructive">
            {{ fieldErrors.title[0] }}
          </p>
        </div>

        <div class="grid gap-x-5 gap-y-5 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label for="ct-project" class="text-sm font-medium">Проект</label>
            <select
              id="ct-project"
              v-model="form.projectId"
              required
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
            >
              <option value="" disabled>Выберите проект</option>
              <option v-for="p in projects" :key="p.id" :value="p.id">
                {{ p.code }} — {{ p.name }}
              </option>
            </select>
            <p v-if="fieldErrors.projectId" class="pt-0.5 text-xs text-destructive">
              {{ fieldErrors.projectId[0] }}
            </p>
          </div>

          <div class="space-y-1.5">
            <label for="ct-stage" class="text-sm font-medium">Стадия пайплайна</label>
            <select
              id="ct-stage"
              v-model="form.stageId"
              :disabled="!form.projectId"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring disabled:opacity-50"
            >
              <option value="">Без стадии</option>
              <option v-for="s in stages" :key="s.id" :value="s.id">
                {{ s.order }}. {{ s.name }}
              </option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label for="ct-shot" class="text-sm font-medium">Шот</label>
            <select
              id="ct-shot"
              v-model="form.shotId"
              :disabled="!form.projectId"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring disabled:opacity-50"
            >
              <option value="">Без привязки к шоту</option>
              <option v-for="s in shots" :key="s.id" :value="s.id">{{ s.code }}</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label for="ct-assignee" class="text-sm font-medium">Исполнитель</label>
            <select
              id="ct-assignee"
              v-model="form.assigneeId"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
            >
              <option value="">Не назначен</option>
              <option v-for="s in staff" :key="s.userId" :value="s.userId">
                {{ s.user.firstName }} {{ s.user.lastName }}
              </option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label for="ct-reviewer" class="text-sm font-medium">Проверяющий</label>
            <select
              id="ct-reviewer"
              v-model="form.reviewerId"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
            >
              <option value="">Не назначен</option>
              <option v-for="s in reviewers" :key="s.userId" :value="s.userId">
                {{ s.user.firstName }} {{ s.user.lastName }}
              </option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label for="ct-hours" class="text-sm font-medium">Оценка, часов</label>
            <input
              id="ct-hours"
              v-model="form.estimatedHours"
              type="number"
              min="0"
              step="0.5"
              placeholder="8"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
            >
          </div>
        </div>

        <div class="grid gap-x-5 gap-y-5 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label for="ct-status" class="text-sm font-medium">Статус</label>
            <select
              id="ct-status"
              v-model="form.status"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
            >
              <option v-for="s in STATUSES" :key="s" :value="s">{{ s.split('_').join(' ') }}</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label for="ct-priority" class="text-sm font-medium">Приоритет</label>
            <select
              id="ct-priority"
              v-model="form.priority"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
            >
              <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label for="ct-start" class="text-sm font-medium">Начало</label>
            <input
              id="ct-start"
              v-model="form.startDate"
              type="date"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
            >
          </div>

          <div class="space-y-1.5">
            <label for="ct-deadline" class="text-sm font-medium">Дедлайн</label>
            <input
              id="ct-deadline"
              v-model="form.deadline"
              type="date"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
            >
            <p v-if="fieldErrors.deadline" class="pt-0.5 text-xs text-destructive">
              {{ fieldErrors.deadline[0] }}
            </p>
          </div>
        </div>

        <div class="space-y-1.5">
          <label for="ct-description" class="text-sm font-medium">Описание</label>
          <textarea
            id="ct-description"
            v-model="form.description"
            rows="4"
            placeholder="Что нужно сделать, ссылки на референсы, требования..."
            class="w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-ring"
          />
        </div>
      </form>

      <footer class="flex items-center justify-end gap-3 border-t px-5 py-3.5">
        <button
          type="button"
          class="px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
          @click="emit('close')"
        >
          Отмена
        </button>
        <button
          type="submit"
          form="create-task-form"
          class="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          :disabled="submitting || !canSubmit"
        >
          {{ submitting ? 'Создание...' : 'Создать задачу' }}
        </button>
      </footer>
    </aside>
  </div>
</template>
