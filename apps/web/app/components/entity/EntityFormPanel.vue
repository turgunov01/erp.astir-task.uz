<script setup lang="ts">
import { UPLOAD_KIND, UPLOAD_LIMITS } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { isUploadCancelled, useChunkedUpload } from '~/composables/useChunkedUpload'

const props = defineProps<{
  config: EntityFormConfig
  /** Existing row for editing; omit to create. */
  record?: Record<string, unknown> | null
}>()

const emit = defineEmits<{ (e: 'close'): void, (e: 'saved', row: unknown): void }>()

const isEdit = computed(() => Boolean(props.record?.id))

/** Create-only fields vanish once the row exists; edit-only appear then. */
const fields = computed(() => props.config.fields.filter(field => (
  isEdit.value ? !field.createOnly : !field.editOnly
)))

const values = reactive<Record<string, unknown>>({})
const saving = ref(false)
const errorMessage = ref('')

/**
 * Seed the form.
 *
 * Editing reads the row: a relation arrives as an object, so its id is what the
 * select needs, and a date arrives as an ISO timestamp the date input cannot
 * parse.
 */
function seed() {
  for (const field of props.config.fields) {
    const raw = props.record ? readPath(props.record, field.path ?? field.key) : undefined
    if (raw === null || raw === undefined) {
      values[field.key] = field.type === 'checkbox' ? false : ''
      continue
    }
    if (field.type === 'date') {
      values[field.key] = String(raw).slice(0, 10)
    } else if (typeof raw === 'object' && 'id' in (raw as Record<string, unknown>)) {
      values[field.key] = (raw as { id: string }).id
    } else {
      values[field.key] = raw
    }
  }
}
seed()
watch(() => props.record, seed)

/** Remote select options, keyed by field. */
const remoteOptions = ref<Record<string, Array<{ value: string, label: string }>>>({})

onMounted(async () => {
  const withSource = props.config.fields.filter(field => field.source)
  await Promise.all(withSource.map(async field => {
    const source = field.source as SelectSource
    try {
      const res = await $fetch<{ data: Array<Record<string, unknown>> }>(source.url, {
        credentials: 'include',
        query: { limit: 100, ...source.query }
      })
      remoteOptions.value[field.key] = (res.data ?? []).map(row => ({
        value: String(readPath(row, source.valueKey ?? 'id') ?? ''),
        label: optionLabel(row, source.labelKeys) ||
          String(readPath(row, source.valueKey ?? 'id') ?? '')
      }))
    } catch {
      // A field whose options fail to load stays usable as an empty select
      // rather than taking the whole form down with it.
      remoteOptions.value[field.key] = []
    }
  }))
})

/*
 * Fields of unequal height sitting side by side is what makes a two-column
 * form look unsettled, so a short form gets a single column.
 */
const gridClass = computed(() =>
  props.config.columns === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'
)

function optionsFor(field: FormField) {
  return field.source ? (remoteOptions.value[field.key] ?? []) : (field.options ?? [])
}

/** Files chosen but not yet uploaded, keyed by field. */
const pendingFiles = reactive<Record<string, File[]>>({})

function addFiles(field: FormField, list: FileList | null) {
  if (!list || list.length === 0) return
  const chosen = Array.from(list)
  const tooBig = oversized(chosen)
  errorMessage.value = tooBig.length > 0
    ? 'Больше 1 ГБ, не добавлены: ' + tooBig.map(file => file.name).join(', ')
    : ''
  const accepted = chosen.filter(file => !tooBig.includes(file))
  pendingFiles[field.key] = [...(pendingFiles[field.key] ?? []), ...accepted]
}

function dropFile(field: FormField, index: number) {
  const current = pendingFiles[field.key] ?? []
  pendingFiles[field.key] = current.filter((_, position) => position !== index)
}

function fileIcon(file: File) {
  if (file.type.startsWith('image/')) return 'lucide:image'
  if (file.type.startsWith('video/')) return 'lucide:video'
  if (file.type.startsWith('audio/')) return 'lucide:music'
  return 'lucide:file'
}

function humanSize(bytes: number) {
  if (bytes < 1024) return bytes + ' Б'
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' КБ'
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ'
}

const {
  progress: uploadProgress,
  fileName: uploadingName,
  uploading,
  upload,
  cancel: cancelUpload
} = useChunkedUpload()

/**
 * Upload whatever was chosen, once the record has an id.
 *
 * A failed upload is reported but does not undo the record: losing a filled-in
 * form because one attachment failed is worse than an attachment missing.
 * Cancelling stops the remaining files too.
 */
async function uploadPending(recordId: string) {
  const failed: string[] = []
  let cancelled = false
  for (const field of fields.value) {
    if (field.type !== 'files' || !field.attachTo) continue
    for (const file of pendingFiles[field.key] ?? []) {
      if (cancelled) break
      try {
        await upload(file, {
          kind: UPLOAD_KIND.DOCUMENT,
          fields: { [field.attachTo]: recordId, name: file.name }
        })
      } catch (err) {
        if (isUploadCancelled(err)) cancelled = true
        else failed.push(file.name + ' (' + apiErrorMessage(err, 'ошибка') + ')')
      }
    }
    pendingFiles[field.key] = []
  }
  return { failed, cancelled }
}

/** Files over the limit are refused when chosen, not after the record is saved. */
function oversized(list: File[]) {
  return list.filter(file => file.size > UPLOAD_LIMITS.MAX_FILE_BYTES)
}

/** Required, plus, once the row exists, any field whose column cannot be emptied. */
function isRequired(field: FormField) {
  return isFieldRequired(field, isEdit.value)
}

const missing = computed(() =>
  fields.value.filter(field =>
    isRequired(field) && field.type !== 'files' && isBlank(values[field.key])
  )
)

async function submit() {
  if (missing.value.length > 0) {
    errorMessage.value = 'Заполните обязательные поля: ' +
      missing.value.map(field => field.label).join(', ')
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    // Editing, the original row lets an emptied field be sent as null.
    const payload = cleanPayload(values, fields.value, {
      original: isEdit.value ? props.record : null
    })
    const row = isEdit.value
      ? await apiRequest<{ data?: { id?: string } }>(
        props.config.endpoint + '/' + props.record?.id,
        { method: 'PATCH', body: payload }
      )
      : await apiRequest<{ data?: { id?: string } }>(
        props.config.endpoint,
        { method: 'POST', body: payload }
      )

    const recordId = row?.data?.id ?? (props.record?.id as string | undefined)
    const result = recordId ? await uploadPending(recordId) : { failed: [], cancelled: false }
    if (result.cancelled || result.failed.length > 0) {
      errorMessage.value = result.cancelled
        ? 'Запись сохранена, загрузка файлов отменена'
        : 'Запись сохранена, но не загрузились файлы: ' + result.failed.join(', ')
      emit('saved', row)
      return
    }

    emit('saved', row)
    emit('close')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось сохранить')
  } finally {
    saving.value = false
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
  <div class="fixed inset-0 z-50">
    <div class="drawer-scrim absolute inset-0 bg-black/30" @click="emit('close')" />

    <div class="absolute inset-y-0 right-0 flex">
      <aside
        class="drawer-panel pointer-events-auto relative flex h-full w-full max-w-2xl flex-col border-l bg-background shadow-xl"
        role="dialog"
        aria-modal="true"
        :aria-label="isEdit ? props.config.editTitle : props.config.createTitle"
      >
        <header class="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <h2 class="truncate text-sm font-semibold tracking-tight">
            {{ isEdit ? props.config.editTitle : props.config.createTitle }}
          </h2>
          <button
            type="button"
            class="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Закрыть"
            @click="emit('close')"
          >
            <Icon name="lucide:x" class="size-4" />
          </button>
        </header>

        <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="submit">
          <div
            class="grid flex-1 auto-rows-min items-start gap-x-6 gap-y-5 overflow-y-auto p-6"
            :class="gridClass"
          >
            <div
              v-for="field in fields"
              :key="field.key"
              :class="field.wide || field.type === 'textarea' ? 'sm:col-span-2' : ''"
            >
              <label
                :for="'field-' + field.key"
                class="mb-1.5 block text-sm font-medium leading-none"
              >
                {{ field.label }}
                <span v-if="isRequired(field)" class="ml-0.5 text-destructive">*</span>
              </label>

              <textarea
                v-if="field.type === 'textarea'"
                :id="'field-' + field.key"
                v-model="values[field.key] as string"
                rows="4"
                :placeholder="field.placeholder"
                class="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />

              <select
                v-else-if="field.type === 'select'"
                :id="'field-' + field.key"
                v-model="values[field.key] as string"
                class="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
              >
                <option v-if="!(isEdit && field.notNull)" value="">{{ field.placeholder ?? 'Не выбрано' }}</option>
                <option v-for="option in optionsFor(field)" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>

              <div v-else-if="field.type === 'files'">
                <label
                  class="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground hover:border-ring hover:text-foreground"
                >
                  <Icon name="lucide:paperclip" class="size-4" />
                  Выбрать фото, видео, аудио или документ (до 1 ГБ)
                  <input
                    :id="'field-' + field.key"
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*,application/pdf"
                    class="sr-only"
                    @change="addFiles(field, ($event.target as HTMLInputElement).files)"
                  >
                </label>

                <ul v-if="(pendingFiles[field.key] ?? []).length > 0" class="mt-2 space-y-1.5">
                  <li
                    v-for="(file, index) in pendingFiles[field.key]"
                    :key="file.name + index"
                    class="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                  >
                    <Icon :name="fileIcon(file)" class="size-4 shrink-0 text-muted-foreground" />
                    <span class="min-w-0 flex-1 truncate">{{ file.name }}</span>
                    <span class="shrink-0 text-xs text-muted-foreground">{{ humanSize(file.size) }}</span>
                    <button
                      type="button"
                      class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                      :aria-label="'Убрать ' + file.name"
                      @click="dropFile(field, index)"
                    >
                      <Icon name="lucide:x" class="size-3.5" />
                    </button>
                  </li>
                </ul>
              </div>

              <label
                v-else-if="field.type === 'checkbox'"
                class="flex h-9 items-center gap-2 text-sm"
              >
                <input
                  :id="'field-' + field.key"
                  v-model="values[field.key] as boolean"
                  type="checkbox"
                  class="size-4 rounded border"
                >
                <span class="text-muted-foreground">{{ field.placeholder ?? 'Да' }}</span>
              </label>

              <input
                v-else
                :id="'field-' + field.key"
                v-model="values[field.key] as string"
                :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'"
                :step="field.type === 'number' ? 'any' : undefined"
                :inputmode="field.type === 'number' ? 'decimal' : undefined"
                :placeholder="field.placeholder"
                class="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
              >

              <p v-if="field.hint" class="mt-1.5 text-xs leading-snug text-muted-foreground">{{ field.hint }}</p>
            </div>
          </div>

          <footer class="border-t px-5 py-3.5">
            <div v-if="uploading" class="mb-3" aria-live="polite">
              <p class="flex items-baseline justify-between gap-3 text-xs">
                <span class="min-w-0 truncate">Загрузка: {{ uploadingName }}</span>
                <button
                  type="button"
                  class="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:text-destructive"
                  @click="cancelUpload()"
                >
                  Отменить
                </button>
              </p>
              <ProgressBar :value="uploadProgress" fluid class="mt-1.5" />
            </div>
            <p
              v-if="errorMessage"
              role="alert"
              class="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {{ errorMessage }}
            </p>
            <div class="flex items-center justify-end gap-3">
              <button
                type="button"
                class="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                @click="emit('close')"
              >
                Отмена
              </button>
              <button
                type="submit"
                :disabled="saving"
                class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {{ saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать' }}
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </div>
  </div>
</template>
