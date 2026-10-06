<script setup lang="ts">
import { PRIORITY_LABEL, TASK_STATUS_LABEL, labelOf } from '~/utils/labels'
import { PERMISSION, PRIORITY, TASK_STATUS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

interface Task {
  id: string
  title: string
  status: string
  priority: string
  deadline: string | null
  assignee: { id: string, firstName: string, lastName: string } | null
  stage: { id: string, name: string } | null
  dependencies: Array<{ dependsOnTask: { id: string, title: string, status: string } }>
}

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ (event: 'changed'): void }>()

const { t } = useI18n()
const auth = useAuthStore()
const canCreate = computed(() => auth.can(PERMISSION.TASK_CREATE))
const canUpdate = computed(() => auth.can(PERMISSION.TASK_UPDATE))

const { openTask } = useTaskPanels()

const statusFilter = ref('')

const { data, pending, error, refresh } = await useFetch<{ data: Task[] }>('/api/tasks', {
  query: computed(() => ({
    projectId: props.projectId,
    limit: 100,
    status: statusFilter.value || undefined
  })),
  credentials: 'include',
  default: () => ({ data: [] })
})

const tasks = computed(() => data.value?.data ?? [])

const { data: staff } = useFetch<{
  data: Array<{ userId: string, user: { firstName: string, lastName: string } }>
}>('/api/employees', { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) })

const { data: stageList } = useFetch<{ data: Array<{ id: string, name: string }> }>('/api/stages', {
  query: { projectId: props.projectId },
  credentials: 'include',
  default: () => ({ data: [] })
})

const showForm = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const busyId = ref('')

const form = reactive({
  title: '',
  assigneeId: '',
  stageId: '',
  priority: PRIORITY.NORMAL as string,
  deadline: '',
  estimatedHours: ''
})

const STATUSES = Object.values(TASK_STATUS)
const PRIORITIES = Object.values(PRIORITY)

function resetForm() {
  form.title = ''
  form.assigneeId = ''
  form.stageId = ''
  form.priority = PRIORITY.NORMAL
  form.deadline = ''
  form.estimatedHours = ''
}

async function createTask() {
  errorMessage.value = ''
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      projectId: props.projectId,
      title: form.title,
      priority: form.priority
    }
    if (form.assigneeId) payload.assigneeId = form.assigneeId
    if (form.stageId) payload.stageId = form.stageId
    if (form.deadline) payload.deadline = form.deadline
    if (form.estimatedHours) payload.estimatedHours = Number(form.estimatedHours)

    await apiRequest('/api/tasks', { method: 'POST', body: payload })
    resetForm()
    showForm.value = false
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, t('projects.tasks.createFailed'))
  } finally {
    submitting.value = false
  }
}

/**
 * A status move can be refused when a prerequisite is unfinished (spec 18).
 * The API returns the blocking task names, so surface them verbatim rather
 * than a generic failure.
 */
async function changeStatus(task: Task, status: string) {
  busyId.value = task.id
  errorMessage.value = ''
  try {
    await apiRequest('/api/tasks/' + task.id + '/status', {
      method: 'POST',
      body: { status, comment: t('projects.tasks.statusComment', { change: statusChangeText(task.status, status) }) }
    })
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, t('projects.tasks.statusFailed'))
  } finally {
    busyId.value = ''
  }
}

function formatDate(value: string | null) {
  return value ? shortDay(value) : '—'
}

function isOverdue(task: Task) {
  return Boolean(task.deadline) &&
    new Date(task.deadline as string) < new Date() &&
    !['DONE', 'APPROVED'].includes(task.status)
}
</script>

<template>
  <section class="rounded-xl border bg-card">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div>
        <h2 class="text-sm font-medium">{{ t('projects.detail.tabs.tasks') }}</h2>
        <p class="mt-1 text-xs text-muted-foreground">{{ countLabel(tasks.length, 'common.count.tasks') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-model="statusFilter"
          class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          :aria-label="t('projects.shots.statusFilter')"
        >
          <option value="">{{ t('projects.list.allStatuses') }}</option>
          <option v-for="s in STATUSES" :key="s" :value="s">{{ labelOf(TASK_STATUS_LABEL, s) }}</option>
        </select>
        <Button v-if="canCreate" size="sm" class="h-8" @click="showForm = !showForm">
          <Icon :name="showForm ? 'lucide:x' : 'lucide:plus'" class="mr-1.5 size-3.5" />
          {{ showForm ? t('common.actions.cancel') : t('projects.tasks.add') }}
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

    <form v-if="showForm" class="space-y-4 border-b bg-muted/20 px-5 py-5" @submit.prevent="createTask">
      <div class="space-y-1.5">
        <Label for="task-title">{{ t('projects.form.name') }}</Label>
        <Input
          id="task-title"
          v-model="form.title"
          required
          maxlength="200"
          class="h-9"
          :placeholder="t('projects.tasks.namePlaceholder')"
        />
      </div>

      <div class="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="space-y-1.5">
          <Label for="task-assignee">{{ t('projects.tasks.assignee') }}</Label>
          <select
            id="task-assignee"
            v-model="form.assigneeId"
            class="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
            <option value="">{{ t('projects.form.unassigned') }}</option>
            <option v-for="s in (staff?.data ?? [])" :key="s.userId" :value="s.userId">
              {{ s.user.firstName }} {{ s.user.lastName }}
            </option>
          </select>
        </div>

        <div class="space-y-1.5">
          <Label for="task-stage">{{ t('projects.tasks.stage') }}</Label>
          <select
            id="task-stage"
            v-model="form.stageId"
            class="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
            <option value="">{{ t('projects.tasks.noStage') }}</option>
            <option v-for="s in (stageList?.data ?? [])" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>

        <div class="space-y-1.5">
          <Label for="task-priority">{{ t('projects.form.priority') }}</Label>
          <select
            id="task-priority"
            v-model="form.priority"
            class="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
            <option v-for="p in PRIORITIES" :key="p" :value="p">{{ labelOf(PRIORITY_LABEL, p) }}</option>
          </select>
        </div>

        <div class="space-y-1.5">
          <Label for="task-deadline">{{ t('projects.form.deadline') }}</Label>
          <Input id="task-deadline" v-model="form.deadline" type="date" class="h-9" />
        </div>
      </div>

      <Button type="submit" size="sm" :disabled="submitting">
        {{ submitting ? t('projects.form.creating') : t('projects.tasks.create') }}
      </Button>
    </form>

    <div v-if="error" class="px-5 py-14 text-center">
      <p class="text-sm text-muted-foreground">{{ t('projects.tasks.loadFailed') }}</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <div v-else-if="pending && tasks.length === 0" class="divide-y">
      <div v-for="n in 4" :key="n" class="flex items-center gap-4 px-5 py-3.5">
        <div class="h-4 flex-1 rounded bg-muted" />
        <div class="h-4 w-24 rounded bg-muted" />
      </div>
    </div>

    <div v-else-if="tasks.length === 0" class="grid place-items-center px-6 py-14 text-center">
      <Icon name="lucide:list-checks" class="size-7 text-muted-foreground/50" />
      <h3 class="mt-3 text-sm font-medium">{{ t('projects.tasks.emptyTitle') }}</h3>
      <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">
        {{ t('projects.tasks.emptyBody') }}
      </p>
    </div>

    <ul v-else class="divide-y">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
        :class="busyId === task.id ? 'opacity-60' : ''"
      >
        <div class="min-w-0 flex-1">
          <button
            type="button"
            class="block max-w-full truncate text-left text-sm font-medium hover:underline"
            @click="openTask(task.id)"
          >
            {{ task.title }}
          </button>
          <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span v-if="task.stage">{{ task.stage.name }}</span>
            <span v-if="task.assignee">
              · {{ task.assignee.firstName }} {{ task.assignee.lastName }}
            </span>
            <span v-if="task.dependencies.length > 0" class="inline-flex items-center gap-1">
              · <Icon name="lucide:link" class="size-3" />
              {{ t('projects.tasks.dependencies', { n: task.dependencies.length }) }}
            </span>
          </p>
        </div>

        <span class="text-xs" :class="isOverdue(task) ? 'text-destructive' : 'text-muted-foreground'">
          {{ formatDate(task.deadline) }}
        </span>

        <StatusBadge :status="task.priority" kind="priority" />

        <select
          v-if="canUpdate"
          :value="task.status"
          :disabled="busyId === task.id"
          class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          :aria-label="t('projects.tasks.statusOf', { name: task.title })"
          @change="changeStatus(task, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="s in STATUSES" :key="s" :value="s">{{ labelOf(TASK_STATUS_LABEL, s) }}</option>
        </select>
        <StatusBadge v-else :status="task.status" />
      </li>
    </ul>
  </section>
</template>
