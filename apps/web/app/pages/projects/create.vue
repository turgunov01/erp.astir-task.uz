<script setup lang="ts">
import { PERMISSION, PROJECT_STATUS, PROJECT_TYPE, PRIORITY } from '@astir/types'
import { PROJECT_TEMPLATES } from '@astir/config'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

useHead({ title: 'Новый проект — Aster ERP' })

const auth = useAuthStore()
if (!auth.can(PERMISSION.PROJECT_CREATE)) {
  throw createError({ statusCode: 403, statusMessage: 'Нет прав на создание проектов' })
}

const { data: clientsResponse } = await useFetch<{ data: Array<{ id: string, name: string }> }>(
  '/api/clients',
  { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) }
)
const { data: staffResponse } = await useFetch<{
  data: Array<{ userId: string, user: { firstName: string, lastName: string, role: string } }>
}>('/api/employees', { query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] }) })

const clients = computed(() => clientsResponse.value?.data ?? [])
const managers = computed(() =>
  (staffResponse.value?.data ?? []).filter(e =>
    ['PROJECT_MANAGER', 'PRODUCER', 'ADMIN', 'OWNER'].includes(e.user.role)
  )
)

const form = reactive({
  name: '',
  clientId: '',
  projectManagerId: '',
  projectType: PROJECT_TYPE.ANIMATION_3D as string,
  status: PROJECT_STATUS.DRAFT as string,
  priority: PRIORITY.NORMAL as string,
  startDate: '',
  deadline: '',
  budget: '',
  currency: 'USD',
  template: '3D Animation',
  description: ''
})

const submitting = ref(false)
const errorMessage = ref('')
const fieldErrors = ref<Record<string, string[]>>({})

const templates = Object.keys(PROJECT_TEMPLATES)
const projectTypes = Object.values(PROJECT_TYPE)
const projectStatuses = Object.values(PROJECT_STATUS)
const priorities = Object.values(PRIORITY)

async function onSubmit() {
  errorMessage.value = ''
  fieldErrors.value = {}
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      name: form.name,
      clientId: form.clientId,
      projectType: form.projectType,
      status: form.status,
      priority: form.priority,
      currency: form.currency,
      template: form.template || undefined,
      description: form.description || undefined
    }
    // Omit empty optionals entirely rather than sending empty strings.
    if (form.projectManagerId) payload.projectManagerId = form.projectManagerId
    if (form.startDate) payload.startDate = form.startDate
    if (form.deadline) payload.deadline = form.deadline
    if (form.budget) payload.budget = Number(form.budget)

    const created = await apiRequest<{ data: { id: string } }>('/api/projects', {
      method: 'POST',
      body: payload
    })
    await navigateTo('/projects/' + created.data.id)
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось создать проект')
    const details = (err as { data?: { error?: { details?: Record<string, string[]> } } })
      ?.data?.error?.details
    if (details) fieldErrors.value = details
  } finally {
    submitting.value = false
  }
}
</script>
<template>
  <!--
    Spacing scale used here, tightest to loosest:
      1.5  label to its control
      2    control to its hint or error
      5    field to field inside one row
      6    row to row inside a card
      5    card to card
      8    form to action bar
    Card headers get their own band (py-4) so the eye lands on the section
    title before the fields, instead of one flat p-5 everywhere.
  -->
  <div class="mx-auto w-full max-w-2xl px-6 py-10 sm:py-14">
    <NuxtLink
      to="/projects"
      class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <Icon name="lucide:arrow-left" class="size-3.5" />
      К проектам
    </NuxtLink>

    <header class="mt-6 border-b pb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Новый проект</h1>
      <p class="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
        Код вида AST-001 присваивается автоматически.
        Шаблон разворачивает пайплайн в той же транзакции.
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
          <p class="mt-1 text-xs text-muted-foreground">
            Название, клиент и ответственные за проект
          </p>
        </div>

        <div class="space-y-6 px-6 py-6">
          <div class="space-y-1.5">
            <Label for="name">Название</Label>
            <Input
              id="name"
              v-model="form.name"
              required
              placeholder="Animated Series — Episode 01"
              class="h-10"
            />
            <p v-if="fieldErrors.name" class="pt-0.5 text-xs text-destructive">
              {{ fieldErrors.name[0] }}
            </p>
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
                <option value="" disabled>Выберите клиента</option>
                <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <p v-if="fieldErrors.clientId" class="pt-0.5 text-xs text-destructive">
                {{ fieldErrors.clientId[0] }}
              </p>
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
        <legend class="sr-only">Сроки, бюджет и пайплайн</legend>

        <div class="border-b bg-muted/30 px-6 py-4">
          <h2 class="text-sm font-medium">Сроки и бюджет</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            Даты определяют расчёт риска, шаблон — состав пайплайна
          </p>
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
              <Input
                id="budget"
                v-model="form.budget"
                type="number"
                min="0"
                step="1000"
                placeholder="180000"
                class="h-10"
              />
            </div>

            <div class="space-y-1.5">
              <Label for="currency">Валюта</Label>
              <Input id="currency" v-model="form.currency" maxlength="3" class="h-10 uppercase" />
            </div>
          </div>

          <div class="space-y-1.5">
            <Label for="template">Шаблон пайплайна</Label>
            <select
              id="template"
              v-model="form.template"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
            >
              <option value="">Без шаблона</option>
              <option v-for="t in templates" :key="t" :value="t">{{ t }}</option>
            </select>
            <p class="pt-0.5 text-xs leading-relaxed text-muted-foreground">
              Стадии создаются вместе с проектом. Без шаблона проект появится
              с пустым пайплайном.
            </p>
          </div>
        </div>
      </fieldset>

      <div class="flex flex-wrap items-center gap-3 pt-3">
        <Button type="submit" class="h-10 px-5" :disabled="submitting">
          {{ submitting ? 'Создание...' : 'Создать проект' }}
        </Button>
        <NuxtLink
          to="/projects"
          class="px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Отмена
        </NuxtLink>
      </div>
    </form>
  </div>
</template>
