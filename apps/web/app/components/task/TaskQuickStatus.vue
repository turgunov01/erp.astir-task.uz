<script setup lang="ts">
import { TASK_STATUS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'

/**
 * Status change without opening the whole task.
 *
 * Same rules as the drawer, collected up front instead of failing after the
 * fact: every move needs a note of what was done, and a late task also needs
 * the reason it slipped, which goes to administration.
 */
const props = defineProps<{
  taskId: string
  status: string
  /** The task is past its deadline and still open. */
  late: boolean
}>()

const emit = defineEmits<{ changed: [], cancel: [] }>()

const MIN_NOTE = 3

/** The move people make most often from each status, offered first. */
const USUAL_NEXT: Record<string, string> = {
  BACKLOG: TASK_STATUS.READY,
  READY: TASK_STATUS.IN_PROGRESS,
  IN_PROGRESS: TASK_STATUS.REVIEW,
  REVISION: TASK_STATUS.REVIEW,
  REVIEW: TASK_STATUS.IN_PROGRESS,
  BLOCKED: TASK_STATUS.IN_PROGRESS,
  APPROVED: TASK_STATUS.DONE,
  DONE: TASK_STATUS.IN_PROGRESS
}

const options = Object.values(TASK_STATUS).filter(status => status !== props.status)
const nextStatus = ref<string>(USUAL_NEXT[props.status] ?? options[0] ?? '')
const note = ref('')
const overdueReason = ref('')
const saving = ref(false)
const errorMessage = ref('')

const ready = computed(() =>
  nextStatus.value !== '' &&
  note.value.trim().length >= MIN_NOTE &&
  (!props.late || overdueReason.value.trim().length >= MIN_NOTE)
)

async function submit() {
  if (!ready.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await apiRequest('/api/tasks/' + props.taskId + '/status', {
      method: 'POST',
      body: {
        status: nextStatus.value,
        comment: note.value.trim(),
        ...(props.late ? { overdueReason: overdueReason.value.trim() } : {})
      }
    })
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось изменить статус')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[12rem_1fr]" @submit.prevent="submit">
    <select
      v-model="nextStatus"
      class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
      aria-label="Новый статус"
    >
      <option v-for="option in options" :key="option" :value="option">
        {{ enumLabel(TASK_STATUS_LABEL, option) }}
      </option>
    </select>

    <input
      v-model="note"
      maxlength="4000"
      placeholder="Что сделано — попадёт в обсуждение задачи"
      class="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
      aria-label="Основание смены статуса"
    >

    <input
      v-if="late"
      v-model="overdueReason"
      maxlength="500"
      placeholder="Почему срок сорван — уйдёт администрации"
      class="h-9 rounded-md border border-destructive/40 bg-background px-3 text-sm outline-none focus:border-ring sm:col-span-2"
      aria-label="Причина просрочки"
    >

    <p v-if="errorMessage" class="text-sm text-destructive sm:col-span-2" role="alert">
      {{ errorMessage }}
    </p>

    <div class="flex items-center justify-end gap-2 sm:col-span-2">
      <button
        type="button"
        class="h-8 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
        @click="emit('cancel')"
      >
        Отмена
      </button>
      <button
        type="submit"
        class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!ready || saving"
      >
        <Icon v-if="saving" name="lucide:loader-circle" class="size-3.5 animate-spin" />
        Сменить статус
      </button>
    </div>
  </form>
</template>
