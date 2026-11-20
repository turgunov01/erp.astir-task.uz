<script setup lang="ts">
import { ROLE, type Role, type CustomRole } from '@astir/types'
import RoleDialog from './RoleDialog.vue'
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
  /** Roles that may never be given more than this list, e.g. client accounts. */
  ceiling: Partial<Record<Role, string[]>>
  customised: Role[]
  deletedRoles: Role[]
  roleNames: Partial<Record<Role, string>>
}

const auth = useAuthStore()
const { t } = useI18n()

const { data: templates, error: templateError, refresh: refreshTemplates } = await useFetch<{ data: CustomRole[] }>(
  '/api/settings/roles?templates=true',
  { key: 'settings-role-templates', credentials: 'include', default: () => ({ data: [] }) }
)
const ROLES = computed(() => [...Object.values(ROLE).filter(role => !data.value?.data.deletedRoles.includes(role)), ...(templates.value?.data ?? []).map(r => r.id)])
const EDITABLE = computed(() => ROLES.value.filter(role => role !== ROLE.OWNER))
const roleLabel = (role: string) => templates.value?.data.find(r => r.id === role)?.name ?? data.value?.data.roleNames[role as Role] ?? enumLabel(ROLE_LABEL, role)
const templateName = ref('')
const creating = ref(false)
const renaming = ref<{ id: string, name: string, builtin?: boolean } | null>(null)
const removeTarget = ref<{ id: string, name: string, builtin?: boolean } | null>(null)
function openRemove(role: string) {
  removeTarget.value = templates.value?.data.find(r => r.id === role) ?? { id: role, name: roleLabel(role), builtin: true }
}
const dialogError = ref('')
function openCreate() {
  templateName.value = ''
  dialogError.value = ''
  creating.value = true
}
function openRename(role: string) {
  const target = templates.value?.data.find(r => r.id === role) ?? { id: role, name: roleLabel(role), builtin: true }
  templateName.value = target.name
  dialogError.value = ''
  renaming.value = target
}
async function renameTemplate() {
  const target = renaming.value
  if (!target || saving.value) return
  saving.value = true
  dialogError.value = ''
  try {
    await apiRequest((target.builtin ? '/api/settings/base-roles/' : '/api/settings/roles/') + target.id, { method: 'PATCH', body: { name: templateName.value.trim() } })
    await refresh()
    await refreshTemplates()
    renaming.value = null
    notify(t('team.roles.saved'))
  } catch (err) {
    dialogError.value = apiErrorMessage(err, t('team.roles.saveFailed'))
  } finally { saving.value = false }
}
async function removeTemplate() {
  const target = removeTarget.value
  if (!target || saving.value) return
  saving.value = true
  try {
    await apiRequest((target.builtin ? '/api/settings/base-roles/' : '/api/settings/roles/') + target.id, { method: 'DELETE' })
    await refresh()
    await refreshTemplates()
    await refreshNuxtData('settings-custom-roles')
    notify(t('team.customRoles.deleted', { name: target.name }))
  } catch (err) {
    notify(apiErrorMessage(err, t('team.customRoles.deleteFailed')), true)
  } finally { saving.value = false; removeTarget.value = null }
}
async function createTemplate() {
  if (saving.value) return
  saving.value = true
  dialogError.value = ''
  try {
    await apiRequest('/api/settings/role-templates', { method: 'POST', body: { name: templateName.value.trim() } })
    await refreshTemplates()
    templateName.value = ''
    creating.value = false
    notify(t('team.roles.saved'))
  } catch (err) {
    dialogError.value = apiErrorMessage(err, t('team.roles.saveFailed'))
  } finally { saving.value = false }
}

const { data, pending, error, refresh } = await useFetch<{ data: MatrixPayload }>(
  '/api/settings/permissions',
  { key: 'settings-role-permissions', credentials: 'include' }
)

/** Working copy: a Set per role, so a toggle is one operation. */
const draft = ref<Record<string, Set<string>>>({})
const customised = ref<Set<string>>(new Set())

function resetDraft() {
  const payload = data.value?.data
  if (!payload) return
  const next: Record<string, Set<string>> = {}
  for (const role of ROLES.value) next[role] = new Set(templates.value?.data.find(r => r.id === role)?.permissions ?? payload.roles[role as Role] ?? [])
  draft.value = next
  customised.value = new Set(payload.customised)
}
watch([data, templates], resetDraft, { immediate: true })

const dirtyRoles = computed(() => {
  const payload = data.value?.data
  if (!payload) return []
  return EDITABLE.value.filter(role => {
    const saved = templates.value?.data.find(r => r.id === role)?.permissions ?? payload.roles[role as Role] ?? []
    const current = draft.value[role]
    if (!current) return false
    return saved.length !== current.size || saved.some(p => !current.has(p))
  })
})

function has(role: string, permission: string) {
  return role === ROLE.OWNER || Boolean(draft.value[role]?.has(permission))
}

/**
 * Why a cell cannot be switched on, or '' when it can.
 *
 * Mirrors the API's two rules: nobody grants a right they do not hold, and a
 * capped role (the client portal) never gets internal rights. Switching a
 * right *off* stays possible either way.
 */
function blocked(role: string, permission: string): string {
  if (role === ROLE.OWNER) return t('team.roles.ownerAll')
  const ceiling = data.value?.data.ceiling[templates.value?.data.find(r => r.id === role)?.baseRole ?? role as Role]
  if (ceiling && !ceiling.includes(permission)) return t('team.roles.ceiling')
  if (!auth.can(permission as never) && !has(role, permission)) {
    return t('team.roles.notYours')
  }
  return ''
}

function toggle(role: string, permission: string) {
  if (!props.canEdit || blocked(role, permission)) return
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
  // Only the grantable rights count, so a capped role's header flips what it can.
  const grantable = keys.filter(key => !blocked(role, key))
  const turnOn = grantable.some(key => !set.has(key))
  for (const key of grantable) {
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
      await apiRequest((templates.value?.data.some(r => r.id === role) ? '/api/settings/roles/' : '/api/settings/permissions/') + role, {
        method: templates.value?.data.some(r => r.id === role) ? 'PATCH' : 'PUT',
        body: { permissions: [...(draft.value[role] ?? [])] }
      })
    }
    await refresh()
    await refreshTemplates()
    // The editor's own session may have changed rights too.
    await auth.refresh()
    notify(t('team.roles.saved'))
  } catch (err: unknown) {
    notify(apiErrorMessage(err, t('team.roles.saveFailed')), true)
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
    notify(t('team.roles.resetDone', { role: roleLabel(role) }))
  } catch (err: unknown) {
    notify(apiErrorMessage(err, t('team.roles.resetFailed')), true)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-medium">{{ t('team.roles.title') }}</h2>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          {{ t('team.roles.intro') }}
        </p>
      </div>
      <div v-if="props.canEdit" class="flex flex-wrap items-center gap-2">
        <Button variant="outline" :disabled="saving || dirtyRoles.length > 0" @click="openCreate">+ {{ t('team.roles.createBase') }}</Button>
        <Button variant="outline" :disabled="saving || dirtyRoles.length === 0" @click="resetDraft">
          {{ t('team.roles.discard') }}
        </Button>
        <Button :disabled="saving || dirtyRoles.length === 0" @click="save">
          {{ saving ? t('common.actions.saving') : (dirtyRoles.length > 0 ? t('team.roles.saveCount', { n: dirtyRoles.length }) : t('common.actions.save')) }}
        </Button>
      </div>
    </div>

    <RoleDialog
      :open="creating || Boolean(renaming)"
      :title="renaming ? t('team.roles.renameBase') : t('team.roles.createBase')"
      :pending="saving"
      @update:open="value => { if (!value) { creating = false; renaming = null } }"
    >
      <form id="base-role-form" class="space-y-4" @submit.prevent="renaming ? renameTemplate() : createTemplate()">
        <p v-if="dialogError" role="alert" class="text-sm text-destructive">{{ dialogError }}</p>
        <label class="block text-sm font-medium">{{ t('team.customRoles.name') }}
          <input v-model="templateName" required minlength="2" maxlength="60" :disabled="saving" class="mt-1.5 h-9 w-full rounded-md border bg-background px-3 outline-none focus:border-ring" />
        </label>
      </form>
      <template #footer>
        <Button type="button" variant="outline" :disabled="saving" @click="creating = false; renaming = null">{{ t('common.actions.cancel') }}</Button>
        <Button type="submit" form="base-role-form" :disabled="saving || templateName.trim().length < 2">{{ saving ? t('common.actions.saving') : (renaming ? t('common.actions.save') : t('common.actions.create')) }}</Button>
      </template>
    </RoleDialog>
    <ConfirmDialog
      v-if="removeTarget"
      :title="t('team.roles.deleteBase')"
      :message="t('team.customRoles.deleteMessage', { name: removeTarget.name })"
      :detail="t(removeTarget.builtin ? 'team.roles.deleteBuiltinDetail' : 'team.roles.deleteBaseDetail')"
      :confirm-label="t('common.actions.delete')"
      :pending="saving"
      @confirm="removeTemplate"
      @cancel="!saving && (removeTarget = null)"
    />

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

    <p v-if="error || templateError" role="alert" class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {{ t('team.roles.loadFailed') }}
    </p>

    <div v-else class="overflow-x-auto rounded-xl border bg-card">
      <table class="w-full min-w-[56rem] text-sm">
        <thead class="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
          <tr class="border-b">
            <th class="sticky left-0 z-20 bg-card px-4 py-2.5 font-medium">{{ t('team.roles.permission') }}</th>
            <th v-for="role in ROLES" :key="role" class="px-2 py-2.5 text-center font-medium">
              <div>{{ roleLabel(role) }}</div>
              <div v-if="props.canEdit && role !== ROLE.OWNER" class="mt-1 flex justify-center gap-2">
                <button type="button" class="rounded p-1 hover:bg-muted disabled:opacity-40" :aria-label="t('team.roles.renameBase') + ': ' + roleLabel(role)" :title="t('team.roles.renameBase')" :disabled="saving || dirtyRoles.length > 0" @click="openRename(role)"><Icon name="lucide:pencil" class="size-3.5" /></button>
                <button type="button" class="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-40" :aria-label="t('team.roles.deleteBase') + ': ' + roleLabel(role)" :title="t('team.roles.deleteBase')" :disabled="saving || dirtyRoles.length > 0" @click="openRemove(role)"><Icon name="lucide:trash-2" class="size-3.5" /></button>
              </div>
              <button
                v-if="props.canEdit && role !== ROLE.OWNER && customised.has(role)"
                type="button"
                class="mt-0.5 text-[11px] font-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-40"
                :disabled="saving"
                @click="resetRole(role)"
              >
                {{ t('team.roles.reset') }}
              </button>
              <span v-else-if="role === ROLE.OWNER" class="mt-0.5 block text-[11px] font-normal text-muted-foreground">{{ t('team.roles.everything') }}</span>
            </th>
          </tr>
        </thead>

        <tbody v-if="pending && !data">
          <tr><td :colspan="ROLES.length + 1" class="px-4 py-8 text-center text-muted-foreground">{{ t('common.states.loading') }}</td></tr>
        </tbody>

        <tbody v-else>
          <template v-for="group in PERMISSION_GROUPS" :key="group.label">
            <tr class="border-t bg-muted">
              <th scope="rowgroup" class="sticky left-0 z-[1] bg-muted px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
                  :disabled="!props.canEdit || saving"
                  :aria-label="t('team.roles.groupAria', { group: group.label, role: roleLabel(role) })"
                  @click="toggleGroup(role, group.permissions.map(p => p.key))"
                >
                  {{ groupState(role, group.permissions.map(p => p.key)) === 'some' ? '–' : '✓' }}
                </button>
              </td>
            </tr>

            <tr v-for="permission in group.permissions" :key="permission.key" class="border-t hover:bg-secondary/30">
              <td class="sticky left-0 z-[1] w-44 bg-card px-4 py-1.5 sm:w-auto">
                <span>{{ permission.label }}</span>
              </td>
              <td v-for="role in ROLES" :key="role" class="px-2 py-1.5 text-center">
                <button
                  type="button"
                  class="inline-grid size-5 place-items-center rounded border text-[11px] leading-none disabled:cursor-default"
                  :class="has(role, permission.key)
                    ? (role === ROLE.OWNER ? 'border-muted-foreground/40 bg-muted text-muted-foreground' : 'border-primary bg-primary text-primary-foreground')
                    : (blocked(role, permission.key) ? 'border-dashed border-input/60 text-transparent' : 'border-input text-transparent hover:border-ring')"
                  :disabled="!props.canEdit || saving || Boolean(blocked(role, permission.key))"
                  :title="blocked(role, permission.key) || undefined"
                  :aria-pressed="has(role, permission.key)"
                  :aria-label="permission.label + ' — ' + roleLabel(role)"
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
