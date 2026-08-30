<script setup lang="ts">
import { PERMISSION } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

interface Member {
  id: string
  userId: string
  roleLabel: string | null
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    role: string
    employee: { position: string, department: { id: string, name: string } | null } | null
  }
}

interface Candidate {
  id: string
  firstName: string
  lastName: string
  role: string
  employee: { position: string } | null
}

const props = defineProps<{ projectId: string }>()

const auth = useAuthStore()
const canAssign = computed(() => auth.can(PERMISSION.TASK_ASSIGN))

const { data, pending, error, refresh } = await useFetch<{ data: Member[] }>(
  () => '/api/projects/' + props.projectId + '/members',
  { credentials: 'include', default: () => ({ data: [] }) }
)

const { data: candidateData, refresh: refreshCandidates } = await useFetch<{ data: Candidate[] }>(
  () => '/api/projects/' + props.projectId + '/members/available',
  { credentials: 'include', default: () => ({ data: [] }) }
)

const members = computed(() => data.value?.data ?? [])
const candidates = computed(() => candidateData.value?.data ?? [])

const showForm = ref(false)
const submitting = ref(false)
const busyId = ref('')
const errorMessage = ref('')

const form = reactive({ userId: '', roleLabel: '' })

async function addMember() {
  errorMessage.value = ''
  submitting.value = true
  try {
    await apiRequest('/api/projects/' + props.projectId + '/members', {
      method: 'POST',
      body: { userId: form.userId, roleLabel: form.roleLabel || null }
    })
    form.userId = ''
    form.roleLabel = ''
    showForm.value = false
    await Promise.all([refresh(), refreshCandidates()])
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось назначить сотрудника')
  } finally {
    submitting.value = false
  }
}

/**
 * Removal is refused by the API while the person still has open tasks here,
 * so surface that message rather than a generic failure.
 */
async function removeMember(member: Member) {
  errorMessage.value = ''
  busyId.value = member.userId
  try {
    await apiRequest(
      '/api/projects/' + props.projectId + '/members/' + member.userId,
      { method: 'DELETE' }
    )
    await Promise.all([refresh(), refreshCandidates()])
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось снять сотрудника с проекта')
  } finally {
    busyId.value = ''
  }
}

/**
 * Role labels are typed into a draft and written by an explicit button.
 *
 * Saving on blur gave no sign that anything happened, so a typed role looked
 * lost until the panel was reopened.
 */
const roleDraft = reactive<Record<string, string>>({})

function draftFor(member: Member) {
  return roleDraft[member.userId] ?? member.roleLabel ?? ''
}

function roleChanged(member: Member) {
  return draftFor(member) !== (member.roleLabel ?? '')
}

async function saveRoleLabel(member: Member, value: string) {
  if (value === (member.roleLabel ?? '')) return
  busyId.value = member.userId
  try {
    await apiRequest(
      '/api/projects/' + props.projectId + '/members/' + member.userId,
      { method: 'PATCH', body: { roleLabel: value || null } }
    )
    delete roleDraft[member.userId]
    await refresh()
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось сохранить роль')
  } finally {
    busyId.value = ''
  }
}

function initials(member: Member) {
  return (member.user.firstName.charAt(0) + member.user.lastName.charAt(0)).toUpperCase()
}
</script>

<template>
  <section class="rounded-xl border bg-card">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div>
        <h2 class="text-sm font-medium">Команда проекта</h2>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ members.length }} назначен(о) · {{ candidates.length }} доступно
        </p>
      </div>
      <Button
        v-if="canAssign"
        size="sm"
        class="h-8"
        :disabled="candidates.length === 0"
        @click="showForm = !showForm"
      >
        <Icon :name="showForm ? 'lucide:x' : 'lucide:user-plus'" class="mr-1.5 size-3.5" />
        {{ showForm ? 'Отмена' : 'Назначить' }}
      </Button>
    </header>

    <p
      v-if="errorMessage"
      role="alert"
      class="border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive"
    >
      {{ errorMessage }}
    </p>

    <form v-if="showForm" class="space-y-4 border-b bg-muted/20 px-5 py-5" @submit.prevent="addMember">
      <div class="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <div class="space-y-1.5">
          <Label for="member-user">Сотрудник</Label>
          <select
            id="member-user"
            v-model="form.userId"
            required
            class="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
            <option value="" disabled>Выберите сотрудника</option>
            <option v-for="c in candidates" :key="c.id" :value="c.id">
              {{ c.firstName }} {{ c.lastName }}<template v-if="c.employee"> — {{ c.employee.position }}</template>
            </option>
          </select>
        </div>

        <div class="space-y-1.5">
          <Label for="member-role">Роль на проекте</Label>
          <Input
            id="member-role"
            v-model="form.roleLabel"
            class="h-9"
            maxlength="80"
            placeholder="Lead Animator"
          />
          <p class="pt-0.5 text-xs text-muted-foreground">
            Описывает работу на этом проекте, права не меняет.
          </p>
        </div>
      </div>

      <Button type="submit" size="sm" :disabled="submitting || !form.userId">
        {{ submitting ? 'Назначение...' : 'Назначить на проект' }}
      </Button>
    </form>

    <div v-if="error" class="px-5 py-14 text-center">
      <p class="text-sm text-muted-foreground">Не удалось загрузить команду</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <div v-else-if="pending && members.length === 0" class="divide-y">
      <div v-for="n in 3" :key="n" class="flex items-center gap-4 px-5 py-3.5">
        <div class="size-8 rounded-full bg-muted" />
        <div class="h-4 flex-1 rounded bg-muted" />
      </div>
    </div>

    <div v-else-if="members.length === 0" class="grid place-items-center px-6 py-14 text-center">
      <Icon name="lucide:users" class="size-7 text-muted-foreground/50" />
      <h3 class="mt-3 text-sm font-medium">Сотрудники не назначены</h3>
      <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Прикрепите команду, чтобы назначать на них задачи и считать загрузку.
      </p>
    </div>

    <ul v-else class="divide-y">
      <li
        v-for="member in members"
        :key="member.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
        :class="busyId === member.userId ? 'opacity-60' : ''"
      >
        <span class="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-medium">
          {{ initials(member) }}
        </span>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">
            {{ member.user.firstName }} {{ member.user.lastName }}
          </p>
          <p class="mt-0.5 truncate text-xs text-muted-foreground">
            {{ member.user.employee?.position ?? member.user.role.split('_').join(' ') }}
            <template v-if="member.user.employee?.department">
              · {{ member.user.employee.department.name }}
            </template>
          </p>
        </div>

        <template v-if="canAssign">
          <input
            :value="draftFor(member)"
            maxlength="80"
            placeholder="Роль на проекте"
            class="h-8 w-40 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
            :aria-label="'Роль ' + member.user.firstName + ' на проекте'"
            @input="roleDraft[member.userId] = ($event.target as HTMLInputElement).value"
            @keydown.enter="saveRoleLabel(member, draftFor(member))"
          >
          <button
            v-if="roleChanged(member)"
            type="button"
            class="h-8 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            :disabled="busyId === member.userId"
            :aria-label="'Сохранить роль ' + member.user.firstName"
            @click="saveRoleLabel(member, draftFor(member))"
          >
            Сохранить
          </button>
        </template>
        <span v-else-if="member.roleLabel" class="text-xs text-muted-foreground">
          {{ member.roleLabel }}
        </span>

        <button
          v-if="canAssign"
          type="button"
          class="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
          :disabled="busyId === member.userId"
          :aria-label="'Снять ' + member.user.firstName + ' с проекта'"
          @click="removeMember(member)"
        >
          <Icon name="lucide:user-minus" class="size-3.5" />
        </button>
      </li>
    </ul>
  </section>
</template>
