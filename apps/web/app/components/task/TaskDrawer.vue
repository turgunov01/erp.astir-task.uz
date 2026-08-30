<script setup lang="ts">
import { PERMISSION, PRIORITY, TASK_STATUS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

interface TaskDetail {
  id: string
  title: string
  description: string | null
  archivedAt: string | null
  status: string
  priority: string
  deadline: string | null
  startDate: string | null
  estimatedHours: string | null
  actualHours: string | null
  projectId: string
  assigneeId: string | null
  stageId: string | null
  project: { id: string, code: string, name: string } | null
  shot: { id: string, code: string } | null
  stage: { id: string, name: string } | null
  assignee: { id: string, firstName: string, lastName: string } | null
  dependencies: Array<{ dependsOnTaskId: string, dependsOnTask: { id: string, title: string, status: string } }>
}

const props = defineProps<{
  taskId: string
  /** Depth in the panel stack; deeper panels sit slightly further left. */
  offset?: number
}>()
const emit = defineEmits<{ (e: 'close'): void, (e: 'changed'): void }>()

const auth = useAuthStore()
const canUpdate = computed(() => auth.can(PERMISSION.TASK_UPDATE))
const canDelete = computed(() => auth.can(PERMISSION.TASK_CREATE))
const canAssign = computed(() => auth.can(PERMISSION.TASK_ASSIGN))

const { data, pending, error, refresh } = await useFetch<{ data: TaskDetail }>(
  () => '/api/tasks/' + props.taskId,
  { credentials: 'include' }
)
const task = computed(() => data.value?.data)

const { data: staff } = await useFetch<{
  data: Array<{ userId: string, user: { firstName: string, lastName: string } }>
}>('/api/employees', { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) })

const stageQuery = computed(() => ({ projectId: task.value?.projectId }))
const { data: stageData } = await useFetch<{ data: Array<{ id: string, name: string }> }>(
  '/api/stages',
  { query: stageQuery, credentials: 'include', default: () => ({ data: [] }), immediate: false }
)

watch(task, value => {
  if (value?.projectId) refreshNuxtData()
}, { once: true })

const errorMessage = ref('')
const saving = ref('')
const confirmDelete = ref(false)
const overdueReason = ref('')
const statusNote = ref('')

/** Every status move needs a written reason or an attached file. */
const noteMissing = computed(() => statusNote.value.trim().length < 3)

/**
 * A late task is treated as a request rather than a free-form record:
 * every change is announced to administration, so the reason is collected
 * up front instead of the save failing after the fact.
 */
const isLate = computed(() => {
  const value = task.value
  if (!value || !value.deadline) return false
  if (['DONE', 'APPROVED'].includes(value.status)) return false
  if (value.archivedAt) return false
  return new Date(value.deadline) < new Date()
})

const daysLate = computed(() => {
  const value = task.value
  if (!isLate.value || !value?.deadline) return 0
  return Math.floor((Date.now() - new Date(value.deadline).getTime()) / 86400000)
})

const reasonMissing = computed(() => isLate.value && overdueReason.value.trim().length < 3)
const confirmArchive = ref(false)

const STATUSES = Object.values(TASK_STATUS)
const PRIORITIES = Object.values(PRIORITY)

/**
 * Fields are edited in a draft and saved on demand.
 *
 * Saving on blur looked like nothing happened, and on an overdue task it
 * failed outright because the reason had not been typed yet. An explicit
 * Сохранить makes the moment of writing visible and lets the whole edit go in
 * one request.
 */
interface TaskDraft {
  title: string
  assigneeId: string
  priority: string
  deadline: string
  estimatedHours: string
  description: string
}

const draft = reactive<TaskDraft>({
  title: '',
  assigneeId: '',
  priority: '',
  deadline: '',
  estimatedHours: '',
  description: ''
})

function resetDraft() {
  const value = task.value
  if (!value) return
  draft.title = value.title
  draft.assigneeId = value.assigneeId ?? ''
  draft.priority = value.priority
  draft.deadline = toDateInput(value.deadline)
  draft.estimatedHours = value.estimatedHours == null ? '' : String(value.estimatedHours)
  draft.description = value.description ?? ''
  seededFor.value = props.taskId
}

/** Only what actually differs from the stored task is sent. */
const changes = computed(() => {
  const value = task.value
  if (!value) return {} as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if (draft.title !== value.title) out.title = draft.title
  if (draft.assigneeId !== (value.assigneeId ?? '')) out.assigneeId = draft.assigneeId || null
  if (draft.priority !== value.priority) out.priority = draft.priority
  if (draft.deadline !== toDateInput(value.deadline)) out.deadline = draft.deadline || null
  const hours = value.estimatedHours == null ? '' : String(value.estimatedHours)
  if (draft.estimatedHours !== hours) {
    out.estimatedHours = draft.estimatedHours === '' ? null : Number(draft.estimatedHours)
  }
  if (draft.description !== (value.description ?? '')) {
    out.description = draft.description || null
  }
  return out
})

const dirty = computed(() => Object.keys(changes.value).length > 0)

/** Which task the draft currently holds, so a refetch cannot silently reseed. */
const seededFor = ref('')

/*
 * Seed the draft when a different task opens, and otherwise only when nothing
 * has been typed.
 *
 * Any refetch hands back a new task object, and this component triggers one
 * itself via refreshNuxtData. Reseeding on every such change wiped whatever was
 * being typed, which read as "editing does nothing".
 */
watch(task, value => {
  if (!value) return
  if (seededFor.value !== props.taskId) {
    resetDraft()
    seededFor.value = props.taskId
    return
  }
  if (!dirty.value) resetDraft()
}, { immediate: true })

async function save() {
  if (!task.value || !dirty.value) return
  if (reasonMissing.value) {
    errorMessage.value = 'Задача просрочена: укажите причину правки'
    return
  }
  saving.value = 'form'
  errorMessage.value = ''
  try {
    await apiRequest('/api/tasks/' + props.taskId, {
      method: 'PATCH',
      body: isLate.value
        ? { ...changes.value, overdueReason: overdueReason.value.trim() }
        : changes.value
    })
    overdueReason.value = ''
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось сохранить')
  } finally {
    saving.value = ''
  }
}

function cancel() {
  resetDraft()
  errorMessage.value = ''
}

/** Status goes through the dedicated endpoint so dependency rules apply. */
async function changeStatus(status: string) {
  saving.value = 'status'
  errorMessage.value = ''
  try {
    await apiRequest('/api/tasks/' + props.taskId + '/status', {
      method: 'POST',
      body: {
        status,
        comment: statusNote.value.trim(),
        ...(isLate.value ? { overdueReason: overdueReason.value.trim() } : {})
      }
    })
    statusNote.value = ''
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось изменить статус')
    await refresh()
  } finally {
    saving.value = ''
  }
}

/** Archiving hides the task from active lists but keeps everything. */
async function toggleArchive() {
  if (!task.value) return
  const action = task.value.archivedAt ? 'unarchive' : 'archive'
  saving.value = 'archive'
  errorMessage.value = ''
  try {
    await apiRequest('/api/tasks/' + props.taskId + '/' + action, {
      method: 'POST'
    })
    confirmArchive.value = false
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось изменить архивный статус')
  } finally {
    saving.value = ''
  }
}

async function removeTask() {
  saving.value = 'delete'
  try {
    await apiRequest('/api/tasks/' + props.taskId, { method: 'DELETE' })
    emit('changed')
    emit('close')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось удалить задачу')
    saving.value = ''
  }
}

async function removeDependency(dependsOnTaskId: string) {
  saving.value = 'dep'
  try {
    await apiRequest(
      '/api/tasks/' + props.taskId + '/dependencies/' + dependsOnTaskId,
      { method: 'DELETE' }
    )
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось снять зависимость')
  } finally {
    saving.value = ''
  }
}

function toDateInput(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : ''
}

// Escape is owned by the panel host, so it closes only the topmost panel.
</script>

<template>
  <aside
    class="drawer-panel pointer-events-auto relative flex h-full w-full max-w-xl flex-col border-l bg-background shadow-xl"
    :style="{ marginRight: (props.offset ?? 0) * 28 + 'px' }"
    role="dialog"
    aria-modal="true"
    aria-label="Задача"
  >
      <header class="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <p class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <NuxtLink
            v-if="task?.project"
            :to="'/projects/' + task.project.id"
            class="truncate hover:text-foreground hover:underline"
          >
            {{ task.project.code }}
          </NuxtLink>
          <NuxtLink
            v-if="task?.shot"
            :to="'/shots/' + task.shot.id"
            class="font-mono hover:text-foreground hover:underline"
          >
            {{ task.shot.code }}
          </NuxtLink>
        </p>
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

      <div v-if="pending && !task" class="space-y-3 p-5">
        <div class="h-7 w-2/3 rounded bg-muted" />
        <div class="h-4 w-1/3 rounded bg-muted" />
        <div class="h-24 rounded bg-muted" />
      </div>

      <div v-else-if="error" class="grid flex-1 place-items-center px-6 text-center">
        <div>
          <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
          <p class="mt-3 text-sm">Не удалось загрузить задачу</p>
          <button type="button" class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="refresh()">
            Повторить
          </button>
        </div>
      </div>

      <div v-else-if="task" class="flex-1 overflow-y-auto px-5 py-5">
        <div
          v-if="isLate"
          class="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3"
        >
          <p class="flex items-center gap-2 text-sm font-medium text-destructive">
            <Icon name="lucide:clock-alert" class="size-4 shrink-0" />
            Просрочена на {{ daysLate }} дн
          </p>
          <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Задача считается заявкой: любое изменение уходит уведомлением
            администрации и попадает в обсуждение ниже. Причина запрашивается
            внизу панели, вместе с кнопкой сохранения.
          </p>

        </div>

        <!-- Title: contenteditable-style inline edit -->
        <input
          v-model="draft.title"
          :disabled="!canUpdate || saving === 'form'"
          maxlength="200"
          class="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xl font-semibold tracking-tight outline-none hover:border-border focus:border-ring disabled:cursor-default"
          aria-label="Название задачи"
        >

        <dl class="mt-5 space-y-1">
          <div class="grid grid-cols-[7.5rem_1fr] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/40">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="lucide:circle-dot" class="size-3.5" /> Статус
            </dt>
            <dd>
              <select
                :value="task.status"
                :disabled="!canUpdate || saving === 'status'"
                class="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-ring"
                @change="changeStatus(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="s in STATUSES" :key="s" :value="s">{{ s.split('_').join(' ') }}</option>
              </select>
              <input
                v-model="statusNote"
                maxlength="4000"
                placeholder="Что сделано — обязательно для смены статуса"
                class="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
                :class="noteMissing ? 'border-destructive/40' : ''"
                aria-label="Основание смены статуса"
              >
              <p class="mt-1 px-0.5 text-xs text-muted-foreground">
                Запись попадёт в обсуждение задачи
              </p>
            </dd>
          </div>

          <div class="grid grid-cols-[7.5rem_1fr] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/40">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="lucide:user" class="size-3.5" /> Исполнитель
            </dt>
            <dd>
              <select
                v-model="draft.assigneeId"
                :disabled="!canAssign || saving === 'form'"
                class="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-ring"
              >
                <option value="">Не назначен</option>
                <option v-for="s in (staff?.data ?? [])" :key="s.userId" :value="s.userId">
                  {{ s.user.firstName }} {{ s.user.lastName }}
                </option>
              </select>
              <p class="mt-1 px-0.5 text-xs text-muted-foreground">
                Исполнитель получит уведомление о назначении
              </p>
            </dd>
          </div>

          <div class="grid grid-cols-[7.5rem_1fr] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/40">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="lucide:flag" class="size-3.5" /> Приоритет
            </dt>
            <dd>
              <select
                v-model="draft.priority"
                :disabled="!canUpdate || saving === 'form'"
                class="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-ring"
              >
                <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
              </select>
            </dd>
          </div>

          <div class="grid grid-cols-[7.5rem_1fr] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/40">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="lucide:calendar" class="size-3.5" /> Дедлайн
            </dt>
            <dd>
              <input
                type="date"
                v-model="draft.deadline"
                :disabled="!canUpdate || saving === 'form'"
                class="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-ring"
              >
            </dd>
          </div>

          <div class="grid grid-cols-[7.5rem_1fr] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/40">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="lucide:clock" class="size-3.5" /> Оценка, ч
            </dt>
            <dd>
              <input
                type="number"
                min="0"
                step="0.5"
                v-model="draft.estimatedHours"
                :disabled="!canUpdate || saving === 'form'"
                class="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-ring"
              >
            </dd>
          </div>

          <div v-if="task.stage" class="grid grid-cols-[7.5rem_1fr] items-center gap-2 px-2 py-1.5">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="lucide:git-branch" class="size-3.5" /> Стадия
            </dt>
            <dd class="text-sm">{{ task.stage.name }}</dd>
          </div>
        </dl>

        <section class="mt-6">
          <h3 class="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Описание
          </h3>
          <textarea
            v-model="draft.description"
            :disabled="!canUpdate || saving === 'form'"
            rows="5"
            placeholder="Добавьте описание..."
            class="mt-2 w-full rounded-md border border-transparent bg-transparent px-2 py-2 text-sm leading-relaxed outline-none hover:border-border focus:border-ring"
          />
        </section>

        <MediaAttachments
          v-if="task"
          owner-key="taskId"
          :owner-id="task.id"
          :can-manage="canUpdate"
        />

        <CommentThread v-if="task" entity-type="Task" :entity-id="task.id" />

        <section v-if="task.dependencies.length > 0" class="mt-6">
          <h3 class="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Зависит от
          </h3>
          <ul class="mt-2 space-y-1">
            <li
              v-for="dep in task.dependencies"
              :key="dep.dependsOnTaskId"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/40"
            >
              <StatusBadge :status="dep.dependsOnTask.status" />
              <span class="min-w-0 flex-1 truncate">{{ dep.dependsOnTask.title }}</span>
              <button
                v-if="canAssign"
                type="button"
                class="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                :aria-label="'Снять зависимость ' + dep.dependsOnTask.title"
                @click="removeDependency(dep.dependsOnTaskId)"
              >
                <Icon name="lucide:x" class="size-3.5" />
              </button>
            </li>
          </ul>
        </section>
      </div>

      <!--
        Save bar appears only once something changed, so it never competes with
        the content while the panel is being read.
      -->
      <div
        v-if="task && dirty"
        class="flex flex-wrap items-end justify-between gap-3 border-t bg-muted/30 px-5 py-3"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm text-muted-foreground">
            Есть несохранённые изменения
          </p>
          <!--
            The reason sits next to the button on purpose: it used to live at the
            top of a scrolling panel, so the disabled button asked for something
            the reader could not see.
          -->
          <input
            v-if="isLate"
            v-model="overdueReason"
            maxlength="500"
            placeholder="Причина правки просроченной задачи"
            class="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
            :class="reasonMissing ? 'border-destructive/60' : ''"
            aria-label="Причина правки просроченной задачи"
          >
          <p v-if="isLate && reasonMissing" class="mt-1 text-xs text-destructive">
            Без причины сохранить нельзя — она уйдёт администрации и в обсуждение
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            :disabled="saving === 'form'"
            @click="cancel"
          >
            Отменить
          </button>
          <button
            type="button"
            class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            :disabled="saving === 'form' || reasonMissing"
            @click="save"
          >
            {{ saving === 'form' ? 'Сохранение...' : 'Сохранить' }}
          </button>
        </div>
      </div>

      <footer v-if="task" class="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5">
        <button
          v-if="canUpdate"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          :disabled="saving === 'archive'"
          @click="task.archivedAt ? toggleArchive() : confirmArchive = true"
        >
          <Icon :name="task.archivedAt ? 'lucide:archive-restore' : 'lucide:archive'" class="size-3.5" />
          {{ task.archivedAt ? 'Вернуть из архива' : 'В архив' }}
        </button>
        <span v-else />

        <button
          v-if="canDelete"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          @click="confirmDelete = true"
        >
          <Icon name="lucide:trash-2" class="size-3.5" />
          Удалить
        </button>
      </footer>
    </aside>

    <ConfirmDialog
      v-if="confirmArchive && task"
      title="Архивировать задачу?"
      :message="'«' + task.title + '» исчезнет из активных списков и доски.'"
      detail="Все данные сохранятся, задачу можно вернуть из архива в любой момент."
      confirm-label="В архив"
      tone="neutral"
      :pending="saving === 'archive'"
      @confirm="toggleArchive"
      @cancel="confirmArchive = false"
    />

    <ConfirmDialog
      v-if="confirmDelete && task"
      title="Удалить задачу?"
      :message="'«' + task.title + '» будет удалена вместе со своими зависимостями и связями.'"
      detail="Если задача просто больше не нужна в работе — используйте архив, он обратим."
      confirm-label="Удалить"
      tone="danger"
      :pending="saving === 'delete'"
      @confirm="removeTask"
      @cancel="confirmDelete = false"
    />
</template>
