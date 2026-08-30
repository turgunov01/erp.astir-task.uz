<script setup lang="ts">
import { PERMISSION } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

const props = defineProps<{
  projectId: string
  projectCode: string
  projectName: string
  status: string
}>()

const auth = useAuthStore()
const canArchive = computed(() => auth.can(PERMISSION.PROJECT_ARCHIVE))
const canHardDelete = computed(() => auth.can(PERMISSION.PROJECT_DELETE))

const isArchived = computed(() => props.status === 'ARCHIVED')

const busy = ref('')
const errorMessage = ref('')

const confirmOpen = ref(false)
const confirmCode = ref('')

/** Archiving hides the project from active lists but keeps every row intact. */
async function archive() {
  errorMessage.value = ''
  busy.value = 'archive'
  try {
    await apiRequest('/api/projects/' + props.projectId, { method: 'DELETE' })
    await navigateTo('/projects')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось архивировать проект')
  } finally {
    busy.value = ''
  }
}

/**
 * Permanent deletion. The typed code is checked again on the server, so this
 * gate is a usability guard rather than the actual protection.
 */
async function hardDelete() {
  errorMessage.value = ''
  busy.value = 'delete'
  try {
    await apiRequest('/api/projects/' + props.projectId + '/hard-delete', {
      method: 'POST',
      body: { confirmCode: confirmCode.value }
    })
    await navigateTo('/projects')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось удалить проект')
  } finally {
    busy.value = ''
  }
}

const codeMatches = computed(
  () => confirmCode.value.trim().toUpperCase() === props.projectCode.toUpperCase()
)
</script>

<template>
  <section v-if="canArchive || canHardDelete" class="overflow-hidden rounded-xl border border-destructive/30">
    <header class="border-b border-destructive/30 bg-destructive/5 px-6 py-4">
      <h2 class="text-sm font-medium text-destructive">Опасная зона</h2>
      <p class="mt-1 text-xs text-muted-foreground">
        Действия ниже влияют на весь проект и его данные.
      </p>
    </header>

    <p
      v-if="errorMessage"
      role="alert"
      class="border-b border-destructive/30 bg-destructive/10 px-6 py-2.5 text-sm text-destructive"
    >
      {{ errorMessage }}
    </p>

    <div class="divide-y">
      <div v-if="canArchive" class="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div class="min-w-0">
          <p class="text-sm font-medium">
            {{ isArchived ? 'Проект в архиве' : 'Архивировать проект' }}
          </p>
          <p class="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Проект скрывается из активных списков, но все данные, файлы и история
            сохраняются. Действие обратимо — статус можно вернуть в форме выше.
          </p>
        </div>
        <Button
          variant="outline"
          class="h-9 shrink-0"
          :disabled="busy !== '' || isArchived"
          @click="archive"
        >
          <Icon name="lucide:archive" class="mr-1.5 size-3.5" />
          {{ busy === 'archive' ? 'Архивация...' : 'Архивировать' }}
        </Button>
      </div>

      <div v-if="canHardDelete" class="px-6 py-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm font-medium text-destructive">Удалить безвозвратно</p>
            <p class="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Будут стёрты эпизоды, сцены, шоты, задачи, версии, стадии пайплайна,
              бюджет, платежи, документы и загруженные файлы. Восстановить нельзя.
            </p>
          </div>
          <Button
            v-if="!confirmOpen"
            variant="outline"
            class="h-9 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
            @click="confirmOpen = true"
          >
            <Icon name="lucide:trash-2" class="mr-1.5 size-3.5" />
            Удалить
          </Button>
        </div>

        <div v-if="confirmOpen" class="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4">
          <div class="space-y-1.5">
            <Label for="confirm-code">
              Введите код проекта <strong>{{ projectCode }}</strong> для подтверждения
            </Label>
            <Input
              id="confirm-code"
              v-model="confirmCode"
              class="h-9 max-w-xs uppercase"
              :placeholder="projectCode"
              autocomplete="off"
            />
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="destructive"
              class="h-9"
              :disabled="!codeMatches || busy !== ''"
              @click="hardDelete"
            >
              {{ busy === 'delete' ? 'Удаление...' : 'Удалить «' + projectName + '» навсегда' }}
            </Button>
            <button
              type="button"
              class="px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
              @click="confirmOpen = false; confirmCode = ''"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
