<script setup lang="ts">
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useTaskPanels } from '~/composables/useTaskPanels'
import { useAuthStore } from '~/stores/auth'

const props = defineProps<{ id: string, offset: number }>()
const emit = defineEmits<{ (e: 'close'): void, (e: 'changed'): void }>()

const auth = useAuthStore()
const { openTask } = useTaskPanels()

interface Review {
  id: string
  reviewType: string
  status: string
  comment: string | null
  deadline: string | null
  createdAt: string
  completedAt: string | null
  reviewer: { id: string, firstName: string, lastName: string } | null
  version: {
    id: string
    versionNumber: number
    label: string
    status: string
    fileUrl: string | null
    previewUrl: string | null
    mimeType: string | null
    notes: string | null
    createdAt: string
    uploadedBy: { id: string, firstName: string, lastName: string } | null
    project: { id: string, code: string, name: string }
    shot: { id: string, code: string } | null
    task: { id: string, title: string } | null
  }
}

const { data, pending, error, refresh } = await useFetch<{ data: Review }>(
  () => '/api/reviews/' + props.id,
  { credentials: 'include' }
)

const review = computed(() => data.value?.data)

const comment = ref('')
const revisionDeadline = ref('')
const saving = ref('')
const errorMessage = ref('')

const isClosed = computed(() =>
  review.value ? ['APPROVED', 'REJECTED'].includes(review.value.status) : false
)

/** Deadline passed with nobody deciding: the discussion window closed. */
const isExpired = computed(() => review.value?.status === 'EXPIRED')

/** How much of the discussion window is left, once there is one. */
const deadlineNote = computed(() => {
  const value = review.value?.deadline
  if (!value) return 'без срока'
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
  if (days < 0) return formatDay(value) + ' · срок прошёл'
  if (days === 0) return formatDay(value) + ' · сегодня последний день'
  return formatDay(value) + ' · осталось ' + days + ' дн.'
})

/**
 * A client closes client reviews; internal staff close internal ones. The API
 * enforces this too — here it only decides whether to show the buttons.
 */
const canDecide = computed(() => {
  if (!review.value || isClosed.value) return false
  const isClientReview = review.value.reviewType === 'CLIENT'
  const role = auth.user?.role
  if (isClientReview) return role === 'CLIENT' || role === 'OWNER' || role === 'ADMIN'
  return role !== 'CLIENT'
})

const isImage = computed(() => Boolean(review.value?.version.mimeType?.startsWith('image/')))
const isVideo = computed(() => Boolean(review.value?.version.mimeType?.startsWith('video/')))

async function decide(decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') {
  saving.value = decision
  errorMessage.value = ''
  try {
    await apiRequest('/api/reviews/' + props.id + '/decision', {
      method: 'POST',
      body: {
        decision,
        comment: comment.value.trim() || null,
        revisionDeadline: decision === 'CHANGES_REQUESTED' && revisionDeadline.value
          ? revisionDeadline.value
          : null
      }
    })
    comment.value = ''
    await refresh()
    emit('changed')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось сохранить решение')
  } finally {
    saving.value = ''
  }
}

// Labels and date formats are shared with the rest of the app in utils/labels.
</script>

<template>
  <aside
    class="drawer-panel pointer-events-auto relative flex h-full w-full max-w-xl flex-col border-l bg-background shadow-xl"
    :style="{ marginRight: props.offset * 28 + 'px' }"
    role="dialog"
    aria-modal="true"
    aria-label="Согласование"
  >
    <header class="flex items-start justify-between gap-3 border-b px-5 py-3.5">
      <div class="min-w-0">
        <p class="text-xs text-muted-foreground">
          {{ review ? REVIEW_TYPE_LABEL[review.reviewType] ?? review.reviewType : '' }} согласование
        </p>
        <h2 class="mt-0.5 truncate font-mono text-sm font-semibold">
          {{ review?.version.label }}
        </h2>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <span
          v-if="isExpired"
          class="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
        >
          Вопрос закрыт
        </span>
        <StatusBadge v-else-if="review" :status="review.status" />
        <button
          type="button"
          class="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Закрыть"
          @click="emit('close')"
        >
          <Icon name="lucide:x" class="size-4" />
        </button>
      </div>
    </header>

    <p
      v-if="errorMessage"
      role="alert"
      class="border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive"
    >
      {{ errorMessage }}
    </p>

    <div v-if="pending && !review" class="space-y-3 p-5">
      <div class="h-40 rounded-lg bg-muted" />
      <div class="h-4 w-2/3 rounded bg-muted" />
    </div>

    <div v-else-if="error" class="grid flex-1 place-items-center px-6 text-center">
      <div>
        <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
        <p class="mt-3 text-sm">Не удалось загрузить согласование</p>
        <button type="button" class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="refresh()">
          Повторить
        </button>
      </div>
    </div>

    <div v-else-if="review" class="flex-1 overflow-y-auto">
      <div class="grid h-52 place-items-center border-b bg-muted/40">
        <img
          v-if="isImage && review.version.fileUrl"
          :src="review.version.fileUrl"
          :alt="review.version.label"
          class="size-full object-contain"
        >
        <video
          v-else-if="isVideo && review.version.fileUrl"
          :src="review.version.fileUrl"
          controls
          class="size-full object-contain"
        />
        <div v-else class="text-center">
          <Icon name="lucide:film" class="size-8 text-muted-foreground/50" />
          <p class="mt-2 text-xs text-muted-foreground">
            Превью недоступно · {{ review.version.mimeType ?? 'файл не загружен' }}
          </p>
        </div>
      </div>

      <dl class="divide-y text-sm">
        <div class="flex items-center justify-between gap-3 px-5 py-2.5">
          <dt class="text-muted-foreground">Проект</dt>
          <dd>
            <NuxtLink :to="'/projects/' + review.version.project.id" class="hover:underline">
              {{ review.version.project.code }}
            </NuxtLink>
          </dd>
        </div>
        <div v-if="review.version.shot" class="flex items-center justify-between gap-3 px-5 py-2.5">
          <dt class="text-muted-foreground">Шот</dt>
          <dd>
            <NuxtLink :to="'/shots/' + review.version.shot.id" class="font-mono hover:underline">
              {{ review.version.shot.code }}
            </NuxtLink>
          </dd>
        </div>
        <div v-if="review.version.task" class="flex items-center justify-between gap-3 px-5 py-2.5">
          <dt class="text-muted-foreground">Задача</dt>
          <dd>
            <button type="button" class="text-left hover:underline" @click="openTask(review.version.task.id)">
              {{ review.version.task.title }}
            </button>
          </dd>
        </div>
        <div class="flex items-center justify-between gap-3 px-5 py-2.5">
          <dt class="text-muted-foreground">Автор версии</dt>
          <dd>
            {{ review.version.uploadedBy
              ? review.version.uploadedBy.firstName + ' ' + review.version.uploadedBy.lastName
              : '—' }}
          </dd>
        </div>
        <div class="flex items-center justify-between gap-3 px-5 py-2.5">
          <dt class="text-muted-foreground">Проверяющий</dt>
          <dd>
            {{ review.reviewer ? review.reviewer.firstName + ' ' + review.reviewer.lastName : 'не назначен' }}
          </dd>
        </div>
        <div class="flex items-center justify-between gap-3 px-5 py-2.5">
          <dt class="text-muted-foreground">Срок обсуждения</dt>
          <dd :class="isExpired ? 'text-muted-foreground' : ''">{{ deadlineNote }}</dd>
        </div>
        <div class="flex items-center justify-between gap-3 px-5 py-2.5">
          <dt class="text-muted-foreground">Отправлено</dt>
          <dd class="tabular-nums text-muted-foreground">{{ formatDay(review.createdAt) }}</dd>
        </div>
      </dl>

      <section v-if="isExpired" class="border-t bg-muted/30 px-5 py-3">
        <p class="text-sm text-muted-foreground">
          Решения до срока не было, поэтому вопрос закрыт. Чтобы вернуть обсуждение,
          задайте новый срок в настройках согласования.
        </p>
      </section>

      <section v-if="review.comment" class="border-t px-5 py-4">
        <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Комментарий
        </h3>
        <p class="mt-2 whitespace-pre-line text-sm leading-relaxed">{{ review.comment }}</p>
      </section>

      <div class="border-t pb-6 pt-2">
        <MediaAttachments
          owner-key="reviewId"
          :owner-id="review.id"
          :can-manage="!isClosed"
          title="Материалы обсуждения"
          empty-text="Материалов нет. Прикрепите фото, видео или аудио к обсуждению."
        />

        <CommentThread entity-type="Review" :entity-id="review.id" />
      </div>
    </div>

    <footer v-if="review && canDecide" class="space-y-3 border-t px-5 py-4">
      <textarea
        v-model="comment"
        rows="3"
        placeholder="Комментарий — обязателен при возврате на доработку"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-ring"
      />
      <input
        v-model="revisionDeadline"
        type="date"
        class="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
        aria-label="Дедлайн правок"
      >
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="h-9 flex-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          :disabled="saving !== ''"
          @click="decide('APPROVED')"
        >
          {{ saving === 'APPROVED' ? 'Сохранение...' : 'Согласовать' }}
        </button>
        <button
          type="button"
          class="h-9 flex-1 rounded-md border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          :disabled="saving !== ''"
          @click="decide('CHANGES_REQUESTED')"
        >
          На доработку
        </button>
        <button
          type="button"
          class="h-9 rounded-md border border-destructive/40 px-3 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
          :disabled="saving !== ''"
          @click="decide('REJECTED')"
        >
          Отклонить
        </button>
      </div>
    </footer>

    <p v-else-if="review && isClosed" class="border-t px-5 py-4 text-center text-sm text-muted-foreground">
      Согласование завершено {{ formatDay(review.completedAt) }}
    </p>
  </aside>
</template>
