<script setup lang="ts">
import { ROLE, ROLE_CEILING, type CustomRole, type Role } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { PERMISSION_GROUPS, ROLE_LABEL, enumLabel } from '~/utils/labels'

/**
 * The studio's own roles: create one, give it a name and a set of rights,
 * then hand it to people from the accounts tab or the employee form.
 *
 * Each role sits on a built-in base role, which keeps deciding what the code
 * reads from the enum (a client role still sees only its client's projects).
 * The rights themselves are the role's own list and replace the base role's.
 */
const props = defineProps<{
  /** Without it the list is read-only. */
  canEdit: boolean
}>()

const { t } = useI18n()
const auth = useAuthStore()

/** Every built-in role but the owner, whose rights are not a starting point. */
const BASE_ROLES = Object.values(ROLE).filter(role => role !== ROLE.OWNER)

const { data, error, refresh } = await useFetch<{ data: CustomRole[] }>(
  '/api/settings/roles',
  { credentials: 'include', default: () => ({ data: [] }) }
)
const roles = computed(() => data.value?.data ?? [])

/* The current rights of each built-in role, to start a new role from. */
const { data: matrixData } = await useFetch<{ data: { roles: Record<Role, string[]> } }>(
  '/api/settings/permissions',
  { credentials: 'include' }
)

/* ----------------------------------------------------------------- draft */

const open = ref(false)
const draft = reactive({
  id: '',
  name: '',
  description: '',
  baseRole: ROLE.ARTIST as Role,
  permissions: new Set<string>()
})
/** The rights the edited role already had, which may stay even if not yours. */
const savedPermissions = ref<Set<string>>(new Set())

const busy = ref(false)
const message = ref('')
const messageIsError = ref(false)

function notify(text: string, isError = false) {
  message.value = text
  messageIsError.value = isError
}

function baseRights(role: Role): string[] {
  return matrixData.value?.data.roles[role] ?? []
}

function startCreate() {
  draft.id = ''
  draft.name = ''
  draft.description = ''
  draft.baseRole = ROLE.ARTIST
  savedPermissions.value = new Set()
  // A new role starts as a copy of its base, which is what most studios want
  // to adjust: "an artist who can also upload documents".
  draft.permissions = new Set(baseRights(draft.baseRole).filter(p => !blocked(p)))
  notify('')
  open.value = true
}

function startEdit(role: CustomRole) {
  draft.id = role.id
  draft.name = role.name
  draft.description = role.description ?? ''
  draft.baseRole = role.baseRole
  savedPermissions.value = new Set(role.permissions)
  draft.permissions = new Set(role.permissions)
  notify('')
  open.value = true
}

function close() {
  open.value = false
  notify('')
}

/** Replace the ticks with whatever the base role holds right now. */
function copyBase() {
  draft.permissions = new Set(baseRights(draft.baseRole).filter(p => !blocked(p) || draft.permissions.has(p)))
}

watch(() => draft.baseRole, (role, previous) => {
  if (!open.value || role === previous) return
  // A capped base (the client portal) cannot keep internal rights.
  const ceiling = ROLE_CEILING[role] as readonly string[] | undefined
  if (ceiling) draft.permissions = new Set([...draft.permissions].filter(p => ceiling.includes(p)))
})

/**
 * Why a right cannot be switched on, or '' when it can.
 *
 * The API's rules, mirrored so the form does not offer what it would refuse:
 * a client-based role stays inside the client set, and nobody adds a right
 * they do not hold. A right already on the role may stay.
 */
function blocked(permission: string): string {
  const ceiling = ROLE_CEILING[draft.baseRole] as readonly string[] | undefined
  if (ceiling && !ceiling.includes(permission)) return t('team.roles.ceiling')
  if (!auth.can(permission as never) && !savedPermissions.value.has(permission)) {
    return t('team.roles.notYours')
  }
  return ''
}

function toggle(permission: string) {
  if (blocked(permission) && !draft.permissions.has(permission)) return
  const next = new Set(draft.permissions)
  if (next.has(permission)) next.delete(permission)
  else next.add(permission)
  draft.permissions = next
}

function groupState(keys: readonly string[]): 'all' | 'some' | 'none' {
  const on = keys.filter(key => draft.permissions.has(key)).length
  if (on === 0) return 'none'
  return on === keys.length ? 'all' : 'some'
}

function toggleGroup(keys: readonly string[]) {
  const grantable = keys.filter(key => !blocked(key))
  const turnOn = grantable.some(key => !draft.permissions.has(key))
  const next = new Set(draft.permissions)
  for (const key of grantable) {
    if (turnOn) next.add(key)
    else next.delete(key)
  }
  draft.permissions = next
}

async function save() {
  busy.value = true
  notify('')
  try {
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      baseRole: draft.baseRole,
      permissions: [...draft.permissions]
    }
    if (draft.id) await apiRequest('/api/settings/roles/' + draft.id, { method: 'PATCH', body })
    else await apiRequest('/api/settings/roles', { method: 'POST', body })
    const name = body.name
    open.value = false
    await refresh()
    // The editor may hold the role they just changed.
    await auth.refresh()
    notify(t('team.customRoles.saved', { name }))
  } catch (err) {
    notify(apiErrorMessage(err, t('team.customRoles.saveFailed')), true)
  } finally {
    busy.value = false
  }
}

/* ---------------------------------------------------------------- delete */

const removeTarget = ref<CustomRole | null>(null)

async function remove() {
  const target = removeTarget.value
  if (!target) return
  busy.value = true
  try {
    await apiRequest('/api/settings/roles/' + target.id, { method: 'DELETE' })
    removeTarget.value = null
    if (draft.id === target.id) close()
    await refresh()
    notify(t('team.customRoles.deleted', { name: target.name }))
  } catch (err) {
    removeTarget.value = null
    notify(apiErrorMessage(err, t('team.customRoles.deleteFailed')), true)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-medium">{{ t('team.customRoles.title') }}</h2>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">{{ t('team.customRoles.intro') }}</p>
      </div>
      <button
        v-if="props.canEdit && !open"
        type="button"
        class="h-9 shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        :disabled="busy"
        @click="startCreate()"
      >
        {{ t('team.customRoles.create') }}
      </button>
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
      {{ t('team.customRoles.loadFailed') }}
    </p>

    <!-- ------------------------------------------------------------ form -->
    <div v-if="open && props.canEdit" class="space-y-4 rounded-xl border bg-card p-5">
      <h3 class="text-sm font-medium">{{ draft.id ? t('team.customRoles.editTitle') : t('team.customRoles.newTitle') }}</h3>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.customRoles.name') }}</span>
          <input
            v-model="draft.name"
            maxlength="60"
            :placeholder="t('team.customRoles.namePlaceholder')"
            class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.customRoles.baseRole') }}</span>
          <select v-model="draft.baseRole" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-ring">
            <option v-for="role in BASE_ROLES" :key="role" :value="role">{{ enumLabel(ROLE_LABEL, role) }}</option>
          </select>
          <span class="mt-1 block text-xs text-muted-foreground">{{ t('team.customRoles.baseRoleHint') }}</span>
        </label>
        <label class="block sm:col-span-2">
          <span class="text-sm font-medium">{{ t('team.customRoles.description') }}</span>
          <input
            v-model="draft.description"
            maxlength="400"
            class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
        </label>
      </div>

      <div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium">
            {{ t('team.customRoles.permissions') }}
            <span class="ml-1 font-normal text-muted-foreground">{{ countLabel(draft.permissions.size, 'team.customRoles.permissionCount') }}</span>
          </p>
          <button type="button" class="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" @click="copyBase()">
            {{ t('team.customRoles.copyBase', { role: enumLabel(ROLE_LABEL, draft.baseRole) }) }}
          </button>
        </div>

        <div class="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <fieldset v-for="group in PERMISSION_GROUPS" :key="group.label" class="rounded-lg border p-3">
            <legend class="px-1">
              <button
                type="button"
                class="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                :aria-label="t('team.customRoles.groupAria', { group: group.label })"
                @click="toggleGroup(group.permissions.map(p => p.key))"
              >
                <span
                  class="inline-grid size-4 place-items-center rounded border text-[10px] leading-none"
                  :class="groupState(group.permissions.map(p => p.key)) === 'none'
                    ? 'border-input text-transparent'
                    : 'border-primary bg-primary text-primary-foreground'"
                >
                  {{ groupState(group.permissions.map(p => p.key)) === 'some' ? '–' : '✓' }}
                </span>
                {{ group.label }}
              </button>
            </legend>
            <label
              v-for="permission in group.permissions"
              :key="permission.key"
              class="flex items-center gap-2 py-0.5 text-sm"
              :class="blocked(permission.key) && !draft.permissions.has(permission.key) ? 'text-muted-foreground/60' : ''"
              :title="blocked(permission.key) || undefined"
            >
              <input
                type="checkbox"
                class="size-4"
                :checked="draft.permissions.has(permission.key)"
                :disabled="Boolean(blocked(permission.key)) && !draft.permissions.has(permission.key)"
                @change="toggle(permission.key)"
              >
              {{ permission.label }}
            </label>
          </fieldset>
        </div>
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          :disabled="busy || draft.name.trim().length < 2"
          @click="save()"
        >
          {{ busy ? t('common.actions.saving') : (draft.id ? t('common.actions.save') : t('common.actions.create')) }}
        </button>
        <button type="button" class="h-9 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground" @click="close()">
          {{ t('common.actions.cancel') }}
        </button>
      </div>
    </div>

    <!-- ------------------------------------------------------------ list -->
    <div v-if="roles.length > 0" class="overflow-x-auto rounded-xl border bg-card">
      <table class="w-full text-sm">
        <thead class="border-b bg-muted/30 text-left text-xs text-muted-foreground">
          <tr>
            <th class="px-5 py-2.5 font-medium">{{ t('team.customRoles.columns.name') }}</th>
            <th class="px-5 py-2.5 font-medium">{{ t('team.customRoles.columns.base') }}</th>
            <th class="px-5 py-2.5 font-medium">{{ t('team.customRoles.columns.rights') }}</th>
            <th class="px-5 py-2.5 font-medium">{{ t('team.customRoles.columns.people') }}</th>
            <th v-if="props.canEdit" class="w-36 px-5 py-2.5" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="role in roles" :key="role.id" class="border-b last:border-0">
            <td class="px-5 py-3">
              <p class="font-medium">{{ role.name }}</p>
              <p v-if="role.description" class="mt-0.5 text-xs text-muted-foreground">{{ role.description }}</p>
            </td>
            <td class="px-5 py-3 text-muted-foreground">{{ enumLabel(ROLE_LABEL, role.baseRole) }}</td>
            <td class="px-5 py-3 text-muted-foreground">{{ countLabel(role.permissions.length, 'team.customRoles.permissionCount') }}</td>
            <td class="px-5 py-3 text-muted-foreground">{{ role.userCount ?? 0 }}</td>
            <td v-if="props.canEdit" class="px-5 py-3 text-right">
              <button type="button" class="text-sm text-muted-foreground hover:text-foreground" @click="startEdit(role)">
                {{ t('common.actions.edit') }}
              </button>
              <button type="button" class="ml-3 text-sm text-destructive hover:opacity-80" @click="removeTarget = role">
                {{ t('common.actions.delete') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="!error" class="rounded-xl border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
      {{ t('team.customRoles.empty') }}
    </p>

    <ConfirmDialog
      v-if="removeTarget"
      :title="t('team.customRoles.deleteTitle')"
      :message="t('team.customRoles.deleteMessage', { name: removeTarget.name })"
      :detail="t('team.customRoles.deleteDetail', { n: removeTarget.userCount ?? 0, base: enumLabel(ROLE_LABEL, removeTarget.baseRole) })"
      :confirm-label="t('common.actions.delete')"
      :pending="busy"
      @confirm="remove()"
      @cancel="removeTarget = null"
    />
  </section>
</template>
