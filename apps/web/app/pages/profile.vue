<script setup lang="ts">
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Profile — Aster ERP' })

const auth = useAuthStore()

const form = reactive({
  firstName: auth.user?.firstName ?? '',
  lastName: auth.user?.lastName ?? '',
  phone: '',
  avatarUrl: auth.user?.avatarUrl ?? ''
})

/**
 * Fields the session does not carry.
 *
 * The auth store holds what the interface needs to draw a header — name,
 * avatar, role — rather than the whole account, so the rest is read once here.
 */
const { data: accountData } = await useFetch<{ data: { phone: string | null } }>(
  '/api/auth/me',
  { credentials: 'include' }
)

watchEffect(() => {
  const phone = accountData.value?.data?.phone
  if (phone && !form.phone) form.phone = phone
})

const saving = ref(false)
const saveError = ref('')
const saved = ref(false)

async function saveProfile() {
  saving.value = true
  saveError.value = ''
  saved.value = false
  try {
    await apiRequest('/api/users/me', {
      method: 'PATCH',
      body: {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || null,
        avatarUrl: form.avatarUrl || null
      }
    })
    // The header shows this name; refresh so it stops showing the old one.
    await auth.refresh()
    saved.value = true
  } catch (err) {
    saveError.value = apiErrorMessage(err, 'Не удалось сохранить профиль')
  } finally {
    saving.value = false
  }
}

/* --------------------------------------------------------------- password */

const password = reactive({ current: '', next: '', repeat: '' })
const passwordError = ref('')
const passwordDone = ref(false)
const changing = ref(false)

const passwordProblem = computed(() => {
  if (!password.current) return 'Введите текущий пароль'
  if (password.next.length < 8) return 'Новый пароль короче 8 символов'
  if (password.next !== password.repeat) return 'Новый пароль и повтор не совпадают'
  return ''
})

async function changePassword() {
  if (passwordProblem.value) {
    passwordError.value = passwordProblem.value
    return
  }
  changing.value = true
  passwordError.value = ''
  passwordDone.value = false
  try {
    await apiRequest('/api/users/me/password', {
      method: 'POST',
      body: { currentPassword: password.current, newPassword: password.next }
    })
    password.current = ''
    password.next = ''
    password.repeat = ''
    passwordDone.value = true
  } catch (err) {
    passwordError.value = apiErrorMessage(err, 'Не удалось сменить пароль')
  } finally {
    changing.value = false
  }
}

const initials = computed(() =>
  ((auth.user?.firstName?.[0] ?? '') + (auth.user?.lastName?.[0] ?? '')).toUpperCase()
)
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Profile</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Профиль</h1>
    </header>

    <section class="mb-4 flex items-center gap-4 rounded-xl border bg-card p-5">
      <span class="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-lg font-semibold">
        <img v-if="form.avatarUrl" :src="form.avatarUrl" alt="" class="size-full object-cover">
        <template v-else>{{ initials }}</template>
      </span>
      <div class="min-w-0">
        <p class="font-medium">{{ auth.user?.firstName }} {{ auth.user?.lastName }}</p>
        <p class="mt-0.5 text-sm text-muted-foreground">{{ auth.user?.email }}</p>
        <p class="mt-1 text-xs text-muted-foreground">
          Роль: {{ enumLabel(ROLE_LABEL, auth.user?.role ?? '') }} — её меняет администратор
          в настройках.
        </p>
      </div>
    </section>

    <section class="mb-6 space-y-4 rounded-xl border bg-card p-5">
      <h2 class="text-sm font-medium">Личные данные</h2>

      <p v-if="saveError" role="alert" class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
        {{ saveError }}
      </p>
      <p v-else-if="saved" class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm">
        Сохранено.
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium">Имя</span>
          <input v-model="form.firstName" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring">
        </label>
        <label class="block">
          <span class="text-sm font-medium">Фамилия</span>
          <input v-model="form.lastName" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring">
        </label>
        <label class="block">
          <span class="text-sm font-medium">Телефон</span>
          <input v-model="form.phone" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring">
        </label>
        <label class="block">
          <span class="text-sm font-medium">Ссылка на аватар</span>
          <input v-model="form.avatarUrl" placeholder="https://..." class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring">
        </label>
      </div>

      <button
        type="button"
        class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        :disabled="saving || !form.firstName.trim() || !form.lastName.trim()"
        @click="saveProfile()"
      >
        {{ saving ? 'Сохраняю...' : 'Сохранить' }}
      </button>
    </section>

    <section class="space-y-4 rounded-xl border bg-card p-5">
      <h2 class="text-sm font-medium">Смена пароля</h2>
      <p class="text-sm text-muted-foreground">
        Текущий пароль нужен даже при открытой сессии — иначе оставленный без
        присмотра экран позволил бы запереть вас из вашей же учётной записи.
      </p>

      <p v-if="passwordError" role="alert" class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
        {{ passwordError }}
      </p>
      <p v-else-if="passwordDone" class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm">
        Пароль изменён.
      </p>

      <div class="grid gap-4 sm:grid-cols-3">
        <label class="block">
          <span class="text-sm font-medium">Текущий</span>
          <input v-model="password.current" type="password" autocomplete="current-password" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring">
        </label>
        <label class="block">
          <span class="text-sm font-medium">Новый</span>
          <input v-model="password.next" type="password" autocomplete="new-password" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring">
        </label>
        <label class="block">
          <span class="text-sm font-medium">Повторите новый</span>
          <input v-model="password.repeat" type="password" autocomplete="new-password" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring">
        </label>
      </div>

      <button
        type="button"
        class="h-9 rounded-md border px-4 text-sm hover:bg-secondary disabled:opacity-50"
        :disabled="changing || Boolean(passwordProblem)"
        @click="changePassword()"
      >
        {{ changing ? 'Меняю...' : 'Сменить пароль' }}
      </button>
    </section>
  </div>
</template>
