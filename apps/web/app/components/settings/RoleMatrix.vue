<script setup lang="ts">
import { ROLE, type Role } from '@astir/types'
import { Button } from '~/components/ui/button'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { PERMISSION_GROUPS, ROLE_LABEL, enumLabel } from '~/utils/labels'

/**
 * Role × permission editor.
 *
 * Rows are permissions grouped by the section they unlock, columns are roles.
 * The owner's column is shown but locked — the owner always has everything,
 * so nobody can edit the studio into having no one who can undo the edit.
 */
const props = defineProps<{
  /** Without it the matrix is read-only. */
  canEdit: boolean
}>()

interface MatrixPayload {
  roles: Record<Role, string[]>
  defaults: Record<Role, string[]>
  customised: Role[]
}

const auth = useAuthStore()

const ROLES = Object.values(ROLE)
const EDITABLE = ROLES.filter(role => role !== ROLE.OWNER)

const { data, pending, error, refresh } = await useFetch<{ data: MatrixPayload }>(
  '/api/settings/permissions',
  { credentials: 'include' }
)

/** Working copy: a Set per role, so a toggle is one operation. */
const draft = ref<Record<string, Set<string>>>({})
const customised = ref<Set<string>>(new Set())

function resetDraft() {
  const payload = data.value?.data
  if (!payload) return
  const next: Record<string, Set<string>> = {}
  for (const role of ROLES) next[role] = new Set(payload.roles[role] ?? [])
  draft.value = next
  customised.value = new Set(payload.customised)
}
watch(data, resetDraft, { immediate: true })

const dirtyRoles = computed(() => {
  const payload = data.value?.data
  if (!payload) return []
  return EDITABLE.filter(role => {
    const saved = payload.roles[role] ?? []
    const current = draft.value[role]
    if (!current) return false
    return saved.length !== current.size || saved.some(p => !current.has(p))
  })
})

function has(role: string, permission: string) {
  return role === ROLE.OWNER || Boolean(draft.value[role]?.has(permission))
}

function toggle(role: string, permission: string) {
  if (!props.canEdit || role === ROLE.OWNER) return
  const set = draft.value[role]
  if (!set) return
  if (set.has(permission)) set.delete(permission)
  else set.add(permission)
  // A Set mutation is invisible to Vue; reassigning the map is the nudge.
  draft.value = { ...draft.value }
}

/** Whether every permission in the group is on, for the group header switch. */
function groupState(role: string, keys: readonly string[]): 'all' | 'some' | 'none' {
  const on = keys.filter(key => has(role, key)).length
  if (on === 0) return 'none'
  return on === keys.length ? 'all' : 'some'
}

function toggleGroup(role: string, keys: readonly string[]) {
  if (!props.canEdit || role === ROLE.OWNER) return
  const set = draft.value[role]
  if (!set) return
  const turnOn = groupState(role, keys) !== 'all'
  for (const key of keys) {
    if (turnOn) set.add(key)
    else set.delete(key)
  }
  draft.value = { ...draft.value }
}

const saving = ref(false)
const message = ref('')
const messageIsError = ref(false)

function notify(text: string, isError = false) {
  message.value = text
  messageIsError.value = isError
}

async function save() {
  if (dirtyRoles.value.length === 0) return
  saving.value = true
  notify('')
  try {
    for (const role of dirtyRoles.value) {
      await apiRequest('/api/settings/permissions/' + role, {
        method: 'PUT',
        body: { permissions: [...(draft.value[role] ?? [])] }
      })
    }
    await refresh()
    // The editor's own session may have changed rights too.
    await auth.refresh()
    notify('Права сохранены. Пользователи увидят изменения при следующей загрузке страницы.')
  } catch (err: unknown) {
    notify(apiErrorMessage(err, 'Не удалось сохранить права'), true)
  } finally {
    saving.value = false
  }
}

async function resetRole(role: string) {
  saving.value = true
  notify('')
  try {
    await apiRequest('/api/settings/permissions/' + role, { method: 'DELETE' })
    await refresh()
    await auth.refresh()
    notify('Роль «' + enumLabel(ROLE_LABEL, role) + '» возвращена к стандартным правам.')
  } catch (err: unknown) {
    notify(apiErrorMessage(err, 'Не удалось сбросить права'), true)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-medium">Кто что видит и может</h2>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          Первая строка каждого раздела открывает его страницу; остальные — действия внутри.
          Владелец всегда может всё. Изменения вступают в силу при следующей загрузке страницы у пользователя.
        </p>
      </div>
      <div v-if="props.canEdit" class="flex items-center gap-2">
        <Button variant="outline" :disabled="saving || dirtyRoles.length === 0" @click="resetDraft">
          Отменить
        </Button>
        <Button :disabled="saving || dirtyRoles.length === 0" @click="save">
          {{ saving ? 'Сохраняем...' : 'Сохранить' + (dirtyRoles.length > 0 ? ' (' + dirtyRoles.length + ')' : '') }}
        </Button>
      </div>
    </div>

    <p
      v-if="message"
      :role="messageIsError ? 'alert' : 'status'"
      class="rounded-md border px-3 py-2 text-sm"
      :class="messageIsError
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'bg-secondary text-secondary-foreground'"
    >
      {{ message }}
    </p>

    <p v-if="error" role="alert" class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      Не удалось загрузить права ролей.
    </p>

    <div v-else class="overflow-x-auto rounded-xl border bg-card">
      <table class="w-full min-w-[56rem] text-sm">
        <thead class="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
          <tr class="border-b">
            <th class="px-4 py-2.5 font-medium">Право</th>
            <th v-for="role in ROLES" :key="role" class="px-2 py-2.5 text-center font-medium">
              <div>{{ enumLabel(ROLE_LABEL, role) }}</div>
              <button
                v-if="props.canEdit && role !== ROLE.OWNER && customised.has(role)"
                type="button"
                class="mt-0.5 text-[11px] font-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-40"
                :disabled="saving"
                @click="resetRole(role)"
              >
                сбросить
              </button>
              <span v-else-if="role === ROLE.OWNER" class="mt-0.5 block text-[11px] font-normal text-muted-foreground">всё</span>
            </th>
          </tr>
        </thead>

        <tbody v-if="pending && !data">
          <tr><td :colspan="ROLES.length + 1" class="px-4 py-8 text-center text-muted-foreground">Загрузка...</td></tr>
        </tbody>

        <tbody v-else>
          <template v-for="group in PERMISSION_GROUPS" :key="group.label">
            <tr class="border-t bg-muted/30">
              <th scope="rowgroup" class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {{ group.label }}
              </th>
              <td v-for="role in ROLES" :key="role" class="px-2 py-1.5 text-center">
                <button
                  v-if="role !== ROLE.OWNER"
                  type="button"
                  class="inline-grid size-5 place-items-center rounded border text-[10px] leading-none disabled:cursor-default"
                  :class="groupState(role, group.permissions.map(p => p.key)) === 'none'
                    ? 'border-input text-transparent hover:border-ring'
                    : 'border-primary bg-primary text-primary-foreground'"
                  :disabled="!props.canEdit"
                  :aria-label="'Весь раздел «' + group.label + '» для роли ' + enumLabel(ROLE_LABEL, role)"
                  @click="toggleGroup(role, group.permissions.map(p => p.key))"
                >
                  {{ groupState(role, group.permissions.map(p => p.key)) === 'some' ? '–' : '✓' }}
                </button>
              </td>
            </tr>

            <tr v-for="permission in group.permissions" :key="permission.key" class="border-t hover:bg-secondary/30">
              <td class="px-4 py-1.5">
                <span>{{ permission.label }}</span>
                <span class="ml-2 font-mono text-[11px] text-muted-foreground/70">{{ permission.key }}</span>
              </td>
              <td v-for="role in ROLES" :key="role" class="px-2 py-1.5 text-center">
                <button
                  type="button"
                  class="inline-grid size-5 place-items-center rounded border text-[11px] leading-none disabled:cursor-default"
                  :class="has(role, permission.key)
                    ? (role === ROLE.OWNER ? 'border-muted-foreground/40 bg-muted text-muted-foreground' : 'border-primary bg-primary text-primary-foreground')
                    : 'border-input text-transparent hover:border-ring'"
                  :disabled="!props.canEdit || role === ROLE.OWNER"
                  :aria-pressed="has(role, permission.key)"
                  :aria-label="permission.label + ' — ' + enumLabel(ROLE_LABEL, role)"
                  @click="toggle(role, permission.key)"
                >
                  ✓
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
