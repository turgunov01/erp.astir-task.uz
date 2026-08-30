<script setup lang="ts">
import { PERMISSION, PROJECT_STATUS, PROJECT_TYPE, PRIORITY } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

const route = useRoute()
const auth = useAuthStore()
const projectId = computed(() => String(route.params.id))

if (!auth.can(PERMISSION.PROJECT_UPDATE)) {
  throw createError({ statusCode: 403, statusMessage: 'Нет прав на изменение проекта' })
}

interface ProjectDetail {
  id: string
  code: string
  name: string
  description: string | null
  status: string
  priority: string
  projectType: string
  startDate: string | null
  deadline: string | null
  budget: string | null
  currency: string
  clientId: string
  projectManagerId: string | null
  producerId: string | null
}

const { data } = await useFetch<{ data: ProjectDetail }>(
  () => '/api/projects/' + projectId.value,
  { credentials: 'include' }
)

const project = computed(() => data.value?.data)
if (!project.value) {
  throw createError({ statusCode: 404, statusMessage: 'Проект не найден' })
}

useHead({ title: computed(() => 'Редактирование ' + (project.value?.code ?? '') + ' — Aster ERP') })

const { data: clientsResponse } = await useFetch<{ data: Array<{ id: string, name: string }> }>(
  '/api/clients',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const { data: staffResponse } = await useFetch<{
  data: Array<{ userId: string, user: { firstName: string, lastName: string, role: string } }>
}>('/api/employees', { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) })

const clients = computed(() => clientsResponse.value?.data ?? [])
const managers = computed(() =>
  (staffResponse.value?.data ?? []).filter(item =>
    ['PROJECT_MANAGER', 'PRODUCER', 'ADMIN', 'OWNER'].includes(item.user.role)
  )
)

/** Date inputs need yyyy-mm-dd, the API returns full ISO timestamps. */
function toDateInput(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : ''
}

const form = reactive({
  name: project.value.name,
  description: project.value.description ?? '',
  clientId: project.value.clientId,
  projectManagerId: project.value.projectManagerId ?? '',
  producerId: project.value.producerId ?? '',
  projectType: project.value.projectType,
  status: project.value.status,
  priority: project.value.priority,
  startDate: toDateInput(project.value.startDate),
  deadline: toDateInput(project.value.deadline),
  budget: project.value.budget ?? '',
  currency: project.value.currency
})

const submitting = ref(false)
const errorMessage = ref('')
const fieldErrors = ref<Record<string, string[]>>({})

const projectTypes = Object.values(PROJECT_TYPE)
const projectStatuses = Object.values(PROJECT_STATUS)
const priorities = Object.values(PRIORITY)

async function onSubmit() {
  errorMessage.value = ''
  fieldErrors.value = {}
  submitting.value = true
  try {
    // Send null rather than an empty string so the API clears the relation.
    const payload: Record<string, unknown> = {
      name: form.name,
      description: form.description || null,
      clientId: form.clientId,
      projectManagerId: form.projectManagerId || null,
      producerId: form.producerId || null,
      projectType: form.projectType,
      status: form.status,
      priority: form.priority,
      startDate: form.startDate || null,
      deadline: form.deadline || null,
      budget: form.budget === '' ? null : Number(form.budget),
      currency: form.currency
    }

    await apiRequest('/api/projects/' + projectId.value, { method: 'PATCH', body: payload })
    await navigateTo('/projects/' + projectId.value)
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось сохранить изменения')
    const details = (err as { data?: { error?: { details?: Record<string, string[]> } } })
      ?.data?.error?.details
    if (details) fieldErrors.value = details
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-6 py-10 sm:py-14">
    <NuxtLink
      :to="'/projects/' + projectId"
      class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <Icon name="lucide:arrow-left" class="size-3.5" />
      К проекту
    </NuxtLink>

    <header class="mt-6 border-b pb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {{ project?.code }}
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Редактирование проекта</h1>
      <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
        Код проекта не меняется. Прогресс и риск считаются автоматически.
      </p>
    </header>

    <p
      v-if="errorMessage"
      role="alert"
      class="mt-6 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <Icon name="lucide:triangle-alert" class="mt-0.5 size-4 shrink-0" />
      <span>{{ errorMessage }}</span>
    </p>

    <form class="mt-8 space-y-5" @submit.prevent="onSubmit">
      <fieldset class="overflow-hidden rounded-xl border bg-card">
        <legend class="sr-only">Основные сведения</legend>
        <div class="border-b bg-muted/30 px-6 py-4">
          <h2 class="text-sm font-medium">Основное</h2>
        </div>

        <div class="space-y-6 px-6 py-6">
          <div class="space-y-1.5">
            <Label for="name">Название</Label>
            <Input id="name" v-model="form.name" required class="h-10" />
            <p v-if="fieldErrors.name" class="pt-0.5 text-xs text-destructive">
              {{ fieldErrors.name[0] }}
            </p>
          </div>

          <div class="space-y-1.5">
            <Label for="description">Описание</Label>
            <textarea
              id="description"
              v-model="form.description"
              rows="4"
              class="w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-ring"
            />
          </div>

          <div class="grid gap-x-5 gap-y-6 sm:grid-cols-2">
            <div class="space-y-1.5">
              <Label for="client">Клиент</Label>
              <select
                id="client"
                v-model="form.clientId"
                required
                class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
              >
                <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>

            <div class="space-y-1.5">
              <Label for="pm">Менеджер проекта</Label>
              <select
                id="pm"
                v-model="form.projectManagerId"
                class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
              >
                <option value="">Не назначен</option>
                <option v-for="m in managers" :key="m.userId" :value="m.userId">
                  {{ m.user.firstName }} {{ m.user.lastName }}
                </option>
              </select>
            </div>
          </div>

          <div class="grid gap-x-5 gap-y-6 sm:grid-cols-3">
            <div class="space-y-1.5">
              <Label for="type">Тип</Label>
              <select
                id="type"
                v-model="form.projectType"
                class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
              >
                <option v-for="t in projectTypes" :key="t" :value="t">
                  {{ enumLabel(PROJECT_TYPE_LABEL, t) }}
                </option>
              </select>
            </div>
            <div class="space-y-1.5">
              <Label for="status">Статус</Label>
              <select
                id="status"
                v-model="form.status"
                class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
              >
                <option v-for="s in projectStatuses" :key="s" :value="s">
                  {{ enumLabel(PROJECT_STATUS_LABEL, s) }}
                </option>
              </select>
            </div>
            <div class="space-y-1.5">
              <Label for="priority">Приоритет</Label>
              <select
                id="priority"
                v-model="form.priority"
                class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
              >
                <option v-for="p in priorities" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset class="overflow-hidden rounded-xl border bg-card">
        <legend class="sr-only">Сроки и бюджет</legend>
        <div class="border-b bg-muted/30 px-6 py-4">
          <h2 class="text-sm font-medium">Сроки и бюджет</h2>
        </div>

        <div class="space-y-6 px-6 py-6">
          <div class="grid gap-x-5 gap-y-6 sm:grid-cols-2">
            <div class="space-y-1.5">
              <Label for="start">Дата начала</Label>
              <Input id="start" v-model="form.startDate" type="date" class="h-10" />
            </div>
            <div class="space-y-1.5">
              <Label for="deadline">Дедлайн</Label>
              <Input id="deadline" v-model="form.deadline" type="date" class="h-10" />
              <p v-if="fieldErrors.deadline" class="pt-0.5 text-xs text-destructive">
                {{ fieldErrors.deadline[0] }}
              </p>
            </div>
          </div>

          <div class="grid gap-x-5 gap-y-6 sm:grid-cols-3">
            <div class="space-y-1.5 sm:col-span-2">
              <Label for="budget">Бюджет</Label>
              <Input id="budget" v-model="form.budget" type="number" min="0" step="1000" class="h-10" />
            </div>
            <div class="space-y-1.5">
              <Label for="currency">Валюта</Label>
              <Input id="currency" v-model="form.currency" maxlength="3" class="h-10 uppercase" />
            </div>
          </div>
        </div>
      </fieldset>

      <div class="flex flex-wrap items-center gap-3 pt-3">
        <Button type="submit" class="h-10 px-5" :disabled="submitting">
          {{ submitting ? 'Сохранение...' : 'Сохранить' }}
        </Button>
        <NuxtLink
          :to="'/projects/' + projectId"
          class="px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Отмена
        </NuxtLink>
      </div>
    </form>

    <div class="mt-10">
      <ProjectDangerZone
        :project-id="projectId"
        :project-code="project?.code ?? ''"
        :project-name="project?.name ?? ''"
        :status="form.status"
      />
    </div>
  </div>
</template>
