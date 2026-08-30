<script setup lang="ts">
import { apiErrorMessage } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

/**
 * Discussion attached to any record.
 *
 * The API keys comments by entity type and id, so one component serves reviews,
 * tasks, shots and the rest. Replies are one level deep, matching the API,
 * which flattens a reply-to-a-reply into the same thread.
 */
const props = withDefaults(defineProps<{
  entityType: 'Task' | 'Shot' | 'Version' | 'Review' | 'Revision' | 'Project' | 'Asset'
  entityId: string
  title?: string
  placeholder?: string
}>(), {
  title: 'Обсуждение',
  placeholder: 'Написать комментарий...'
})

const auth = useAuthStore()

interface Author {
  id: string
  firstName: string
  lastName: string
  avatarUrl?: string | null
}

interface Comment {
  id: string
  message: string
  createdAt: string
  user: Author | null
  replies?: Comment[]
}

const { data, pending, error, refresh } = await useFetch<{ data: Comment[] }>('/api/comments', {
  query: computed(() => ({ entityType: props.entityType, entityId: props.entityId })),
  credentials: 'include',
  default: () => ({ data: [] })
})

const comments = computed(() => data.value?.data ?? [])
const total = computed(() =>
  comments.value.reduce((sum, item) => sum + 1 + (item.replies?.length ?? 0), 0)
)

const draft = ref('')
const replyTo = ref<string | null>(null)
const replyDraft = ref('')
const editingId = ref<string | null>(null)
const editDraft = ref('')
const busy = ref(false)
const errorMessage = ref('')

async function send(message: string, parentId: string | null) {
  const text = message.trim()
  if (!text) return
  busy.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/comments', {
      method: 'POST',
      credentials: 'include',
      body: { entityType: props.entityType, entityId: props.entityId, message: text, parentId }
    })
    await refresh()
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось отправить комментарий')
  } finally {
    busy.value = false
  }
}

async function submitRoot() {
  const text = draft.value
  draft.value = ''
  await send(text, null)
}

async function submitReply(parentId: string) {
  const text = replyDraft.value
  replyDraft.value = ''
  replyTo.value = null
  await send(text, parentId)
}

function startEdit(comment: Comment) {
  editingId.value = comment.id
  editDraft.value = comment.message
}

async function saveEdit(id: string) {
  const text = editDraft.value.trim()
  if (!text) return
  busy.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/comments/' + id, {
      method: 'PATCH', credentials: 'include', body: { message: text }
    })
    editingId.value = null
    await refresh()
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось сохранить')
  } finally {
    busy.value = false
  }
}

async function remove(id: string) {
  busy.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/comments/' + id, { method: 'DELETE', credentials: 'include' })
    await refresh()
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось удалить комментарий')
  } finally {
    busy.value = false
  }
}

/** Only the author edits or deletes their own line; the API enforces it too. */
function isMine(comment: Comment) {
  return Boolean(comment.user && auth.user && comment.user.id === auth.user.id)
}

function initials(author: Author | null) {
  if (!author) return '?'
  return (author.firstName[0] ?? '') + (author.lastName[0] ?? '')
}

/** Relative for anything recent, absolute once it stops being "today". */
function when(value: string) {
  const date = new Date(value)
  const minutes = Math.round((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return minutes + ' мин назад'
  if (minutes < 24 * 60) return Math.floor(minutes / 60) + ' ч назад'
  return formatDateTime(value)
}
</script>

<template>
  <section class="mt-6">
    <h3 class="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {{ props.title }}
      <span v-if="total > 0" class="ml-1 tabular-nums">{{ total }}</span>
    </h3>

    <p v-if="errorMessage" role="alert" class="mt-2 px-2 text-xs text-destructive">
      {{ errorMessage }}
    </p>

    <div v-if="pending && comments.length === 0" class="mt-3 space-y-3 px-2">
      <div v-for="n in 2" :key="n" class="h-12 rounded-lg bg-muted" />
    </div>

    <p v-else-if="error" class="mt-3 px-2 text-sm text-destructive">
      Не удалось загрузить обсуждение
    </p>

    <p v-else-if="comments.length === 0" class="mt-3 px-2 text-sm text-muted-foreground">
      Обсуждения пока нет. Напишите первый комментарий.
    </p>

    <ul v-else class="mt-3 space-y-4 px-2">
      <li v-for="comment in comments" :key="comment.id">
        <article class="flex gap-2.5">
          <span
            class="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-medium uppercase"
            aria-hidden="true"
          >
            {{ initials(comment.user) }}
          </span>

          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-baseline gap-x-2">
              <span class="text-sm font-medium">
                {{ comment.user ? comment.user.firstName + ' ' + comment.user.lastName : 'Удалённый пользователь' }}
              </span>
              <span class="text-xs text-muted-foreground">{{ when(comment.createdAt) }}</span>
            </p>

            <div v-if="editingId === comment.id" class="mt-1.5">
              <textarea
                v-model="editDraft"
                rows="3"
                class="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
              <div class="mt-1.5 flex gap-2">
                <button
                  type="button"
                  class="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  :disabled="busy"
                  @click="saveEdit(comment.id)"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  class="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  @click="editingId = null"
                >
                  Отмена
                </button>
              </div>
            </div>

            <p v-else class="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">
              {{ comment.message }}
            </p>

            <div v-if="editingId !== comment.id" class="mt-1 flex gap-3 text-xs text-muted-foreground">
              <button type="button" class="hover:text-foreground" @click="replyTo = comment.id">
                Ответить
              </button>
              <template v-if="isMine(comment)">
                <button type="button" class="hover:text-foreground" @click="startEdit(comment)">
                  Изменить
                </button>
                <button type="button" class="hover:text-destructive" @click="remove(comment.id)">
                  Удалить
                </button>
              </template>
            </div>

            <ul v-if="comment.replies && comment.replies.length > 0" class="mt-3 space-y-3 border-l pl-3">
              <li v-for="reply in comment.replies" :key="reply.id" class="flex gap-2.5">
                <span
                  class="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-medium uppercase"
                  aria-hidden="true"
                >
                  {{ initials(reply.user) }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="flex flex-wrap items-baseline gap-x-2">
                    <span class="text-sm font-medium">
                      {{ reply.user ? reply.user.firstName + ' ' + reply.user.lastName : 'Удалённый пользователь' }}
                    </span>
                    <span class="text-xs text-muted-foreground">{{ when(reply.createdAt) }}</span>
                  </p>
                  <p class="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{{ reply.message }}</p>
                  <button
                    v-if="isMine(reply)"
                    type="button"
                    class="mt-1 text-xs text-muted-foreground hover:text-destructive"
                    @click="remove(reply.id)"
                  >
                    Удалить
                  </button>
                </div>
              </li>
            </ul>

            <div v-if="replyTo === comment.id" class="mt-2.5">
              <textarea
                v-model="replyDraft"
                rows="2"
                placeholder="Ответить..."
                class="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
              <div class="mt-1.5 flex gap-2">
                <button
                  type="button"
                  class="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  :disabled="busy || !replyDraft.trim()"
                  @click="submitReply(comment.id)"
                >
                  Ответить
                </button>
                <button
                  type="button"
                  class="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  @click="replyTo = null"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </article>
      </li>
    </ul>

    <div class="mt-4 px-2">
      <textarea
        v-model="draft"
        rows="3"
        :placeholder="props.placeholder"
        class="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
        aria-label="Новый комментарий"
      />
      <div class="mt-2 flex justify-end">
        <button
          type="button"
          class="h-8 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          :disabled="busy || !draft.trim()"
          @click="submitRoot"
        >
          {{ busy ? 'Отправка...' : 'Отправить' }}
        </button>
      </div>
    </div>
  </section>
</template>
