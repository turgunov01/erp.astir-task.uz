<script setup lang="ts">
import RoleDialog from './RoleDialog.vue'
import { ROLE, ROLE_CEILING, combinedRoleBase, type CustomRole, type Role } from '@astir/types'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { PERMISSION_GROUPS, ROLE_LABEL, enumLabel } from '~/utils/labels'

/**
 * The studio's own roles: create one, give it a name and a set of rights,
 * then hand it to people from the accounts tab or the employee form.
 *
 * Several templates supply a combined permission snapshot; later template edits
 * do not change the derived role. Its system identity still determines what code
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
const BASE_ROLES = computed(() => Object.values(ROLE).filter(role => role !== ROLE.OWNER && !matrixData.value?.data.deletedRoles.includes(role)))

const { data, error, refresh } = await useFetch<{ data: CustomRole[] }>(
  '/api/settings/roles',
  { key: 'settings-custom-roles', credentials: 'include', default: () => ({ data: [] }) }
)
const roles = computed(() => data.value?.data ?? [])

/* The current rights of each built-in role, to start a new role from. */
const { data: matrixData } = await useFetch<{ data: { roles: Record<Role, string[]>, deletedRoles: Role[], roleNames: Partial<Record<Role, string>> } }>(
  '/api/settings/permissions',
  { key: 'settings-role-permissions', credentials: 'include' }
)

const { data: templateData } = await useFetch<{ data: CustomRole[] }>(
  '/api/settings/roles?templates=true',
  { key: 'settings-role-templates', credentials: 'include', default: () => ({ data: [] }) }
)
const selectedBases = ref<string[]>([])
const overrides = ref<Map<string, boolean>>(new Map())
const sourceOptions = computed(() => [
  ...BASE_ROLES.value.map(role => ({ id: role, name: matrixData.value?.data.roleNames[role] ?? enumLabel(ROLE_LABEL, role), baseRole: role, permissions: matrixData.value?.data.roles[role] ?? [] })),
  ...(templateData.value?.data ?? [])
])
function sourcePermissions() {
  return new Set(sourceOptions.value.filter(r => selectedBases.value.includes(r.id)).flatMap(r => r.permissions))
}
function applySources() {
  draft.baseRole = combinedRoleBase(sourceOptions.value.filter(r => selectedBases.value.includes(r.id)).map(r => r.baseRole))
  const permissions = sourcePermissions()
  for (const [permission, enabled] of overrides.value) {
    if (enabled) permissions.add(permission)
    else permissions.delete(permission)
  }
  draft.permissions = new Set([...permissions].filter(p => !blocked(p)))
}
function toggleBase(id: string) {
  selectedBases.value = selectedBases.value.includes(id) ? selectedBases.value.filter(value => value !== id) : [...selectedBases.value, id]
  applySources()
}
function sourcesLabel(role: CustomRole) {
  return [...role.baseRoles.map(r => matrixData.value?.data.roleNames[r] ?? enumLabel(ROLE_LABEL, r)), ...role.baseTemplateIds.map(id => templateData.value?.data.find(r => r.id === id)?.name).filter(Boolean)].join(', ') || '—'
}

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


function startCreate() {
  selectedBases.value = []
  overrides.value = new Map()
  draft.id = ''
  draft.name = ''
  draft.description = ''
  draft.baseRole = ROLE.ARTIST
  savedPermissions.value = new Set()
  // Rights start empty until a source role or individual permission is selected.
  draft.permissions = new Set()
  notify('')
  open.value = true
}

function startEdit(role: CustomRole) {
  selectedBases.value = [...role.baseRoles, ...role.baseTemplateIds]
  draft.id = role.id
  draft.name = role.name
  draft.description = role.description ?? ''
  draft.baseRole = role.baseRole
  savedPermissions.value = new Set(role.permissions)
  draft.permissions = new Set(role.permissions)
  const combined = sourcePermissions()
  overrides.value = new Map([...new Set([...combined, ...role.permissions])].filter(p => combined.has(p) !== role.permissions.includes(p as never)).map(p => [p, role.permissions.includes(p as never)]))
  notify('')
  open.value = true
}

function close() {
  if (busy.value) return
  open.value = false
  notify('')
}

/** Replace the ticks with whatever the base role holds right now. */
function copyBase() {
  overrides.value = new Map()
  applySources()
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
  overrides.value.set(permission, next.has(permission))
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
    overrides.value.set(key, turnOn)
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
      baseRoles: selectedBases.value.filter(id => Object.values(ROLE).includes(id as Role)),
      baseTemplateIds: selectedBases.value.filter(id => !Object.values(ROLE).includes(id as Role)),
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
      v-if="message && !open"
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
    <RoleDialog :open="open && props.canEdit" :title="draft.id ? t('team.customRoles.editTitle') : t('team.customRoles.newTitle')" :pending="busy" wide @update:open="value => { if (!value) close() }">
      <form id="custom-role-form" class="space-y-4" @submit.prevent="save()">
        <p v-if="message && messageIsError" role="alert" class="text-sm text-destructive">{{ message }}</p>
        <fieldset :disabled="busy" class="space-y-4">

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.customRoles.name') }}</span>
          <input
            v-model="draft.name"
            required
            minlength="2"
            maxlength="60"
            :placeholder="t('team.customRoles.namePlaceholder')"
            class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
        </label>
        <fieldset class="min-w-0">
          <legend class="text-sm font-medium">{{ t('team.customRoles.baseRole') }}</legend>
          <div class="mt-1.5 grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-2">
            <label v-for="source in sourceOptions" :key="source.id" class="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted">
              <input type="checkbox" class="size-4 shrink-0" :checked="selectedBases.includes(source.id)" @change="toggleBase(source.id)">
              <span>{{ source.name }}</span>
            </label>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('team.customRoles.baseRoleHint') }}</p>
        </fieldset>
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
            {{ t('team.customRoles.copyBases') }}
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

        </fieldset>
      </form>
      <template #footer>
        <button
          type="submit"
          form="custom-role-form"
          class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          :disabled="busy || draft.name.trim().length < 2"
        >
          {{ busy ? t('common.actions.saving') : (draft.id ? t('common.actions.save') : t('common.actions.create')) }}
        </button>
        <button type="button" class="h-9 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground" :disabled="busy" @click="close()">
          {{ t('common.actions.cancel') }}
        </button>
      </template>
    </RoleDialog>

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
            <td class="px-5 py-3 text-muted-foreground">{{ sourcesLabel(role) }}</td>
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
