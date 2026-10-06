<script setup lang="ts">
import { apiErrorMessage, apiRequest, useListResource } from '~/composables/useApi'
import { DEFAULT_LOCALE, LOCALE_COOKIE, PERMISSION, ROLE, type Locale, type Permission } from '@astir/types'
import LocaleSelect from '~/components/locale/LocaleSelect.vue'
import RoleMatrix from '~/components/settings/RoleMatrix.vue'
import WorkSchedule from '~/components/settings/WorkSchedule.vue'
import { useAuthStore } from '~/stores/auth'

const { t, locale, setLocale } = useI18n()
const localeCookie = useCookie<string | null>(LOCALE_COOKIE)
useHead({ title: computed(() => t('team.settings.title')) })

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const brand = useBrand()
const canManage = computed(() => auth.can(PERMISSION.SETTINGS_MANAGE))
const canManageUsers = computed(() => auth.can(PERMISSION.USER_MANAGE))

interface SettingsTab {
  /** Also the message key under team.settings.tabs. */
  key: string
  /** Narrower than the page itself; the tab is hidden without it. */
  permission?: Permission
}

/** Tabs live in the URL so a link can point at the one being discussed. */
const TABS: SettingsTab[] = [
  { key: 'studio' },
  { key: 'schedule' },
  { key: 'mail' },
  { key: 'templates' },
  { key: 'users', permission: PERMISSION.USER_MANAGE },
  { key: 'roles', permission: PERMISSION.PERMISSION_MANAGE }
]

const canEditRoles = computed(() => auth.can(PERMISSION.PERMISSION_MANAGE))

const visibleTabs = computed(() => TABS.filter(entry => !entry.permission || auth.can(entry.permission)))
const tab = computed({
  get: () => {
    const wanted = String(route.query.tab ?? 'studio')
    return visibleTabs.value.some(entry => entry.key === wanted) ? wanted : 'studio'
  },
  set: value => router.replace({ query: { ...route.query, tab: value } })
})
const tabStrip = useTabStrip(tab)

/* ----------------------------------------------------------------- studio */

interface Settings {
  name: string
  legalName: string | null
  logoUrl: string | null
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  currency: string
  timezone: string
  invoicePrefix: string
  /** Language for everyone without their own choice, and for the sign-in page. */
  defaultLocale: Locale
  smtpHost: string | null
  smtpPort: number | null
  smtpUser: string | null
  smtpFrom: string | null
  /** The password itself never leaves the server; this says whether one exists. */
  smtpPasswordSet: boolean
}

const { data: settingsData, refresh: refreshSettings } = useFetch<{ data: Settings }>(
  '/api/settings',
  { credentials: 'include' }
)

const form = reactive<Partial<Settings>>({})
const smtpPassword = ref('')

watchEffect(() => {
  const loaded = settingsData.value?.data
  if (loaded) Object.assign(form, loaded)
})

const saving = ref(false)
const saveError = ref('')
const saved = ref(false)

async function save(fields: string[]) {
  saving.value = true
  saveError.value = ''
  saved.value = false
  try {
    const body: Record<string, unknown> = {}
    const current = form as Record<string, unknown>
    for (const key of fields) body[key] = current[key]
    // Sent only when the user typed one: an untouched field must not wipe the
    // stored password, which they cannot see in order to retype it.
    if (fields.includes('smtpHost') && smtpPassword.value) {
      body.smtpPassword = smtpPassword.value
    }

    const response = await apiRequest<{ data: Settings }>('/api/settings', { method: 'PATCH', body })
    // The sidebar, tab titles and the language fallback read from here; keep them current.
    brand.value = {
      name: response.data.name,
      logoUrl: response.data.logoUrl ?? null,
      defaultLocale: response.data.defaultLocale ?? DEFAULT_LOCALE,
      loaded: true
    }
    // Someone with no language of their own (account or this browser) sees the new default at once.
    if (!auth.user?.locale && !localeCookie.value && locale.value !== brand.value.defaultLocale) {
      await setLocale(brand.value.defaultLocale)
    }
    smtpPassword.value = ''
    saved.value = true
    await refreshSettings()
  } catch (err) {
    saveError.value = apiErrorMessage(err, t('team.settings.saveFailed'))
  } finally {
    saving.value = false
  }
}

const STUDIO_FIELDS = [
  'name', 'legalName', 'email', 'phone', 'website', 'address',
  'currency', 'timezone', 'invoicePrefix', 'defaultLocale'
]

/* The select works with null for «no choice»; the studio always has one. */
const defaultLanguage = computed({
  get: () => form.defaultLocale ?? DEFAULT_LOCALE,
  set: (code: Locale | null) => { form.defaultLocale = code ?? DEFAULT_LOCALE }
})
const MAIL_FIELDS = ['smtpHost', 'smtpPort', 'smtpUser', 'smtpFrom']

/* ------------------------------------------------------------------- mail */

const testing = ref(false)
const testResult = ref('')
const testOk = ref(false)

async function testMail() {
  testing.value = true
  testResult.value = ''
  try {
    const res = await apiRequest<{ data: { delivered: boolean, message: string } }>(
      '/api/settings/mail/test',
      { method: 'POST' }
    )
    testOk.value = res.data.delivered
    testResult.value = res.data.message
  } catch (err) {
    testOk.value = false
    testResult.value = apiErrorMessage(err, t('team.settings.mail.testFailed'))
  } finally {
    testing.value = false
  }
}

/* -------------------------------------------------------------- templates */

interface Template {
  id: string
  name: string
  description: string | null
  stages: string[]
  isDefault: boolean
}

const { data: templateData, refresh: refreshTemplates } = useFetch<{ data: Template[] }>(
  '/api/settings/templates',
  { credentials: 'include', default: () => ({ data: [] }) }
)
const templates = computed(() => templateData.value?.data ?? [])

const draft = reactive({ id: '', name: '', description: '', stages: '', isDefault: false })
const templateError = ref('')
const templateBusy = ref(false)

function editTemplate(template: Template) {
  draft.id = template.id
  draft.name = template.name
  draft.description = template.description ?? ''
  draft.stages = template.stages.join('\n')
  draft.isDefault = template.isDefault
}

function resetDraft() {
  draft.id = ''
  draft.name = ''
  draft.description = ''
  draft.stages = ''
  draft.isDefault = false
  templateError.value = ''
}

async function saveTemplate() {
  templateBusy.value = true
  templateError.value = ''
  try {
    const body = {
      name: draft.name,
      description: draft.description || null,
      // One stage per line: this is an ordered list, and a textarea makes
      // reordering a matter of moving a line.
      stages: draft.stages.split('\n').map(line => line.trim()).filter(Boolean),
      isDefault: draft.isDefault
    }
    if (draft.id) await apiRequest('/api/settings/templates/' + draft.id, { method: 'PATCH', body })
    else await apiRequest('/api/settings/templates', { method: 'POST', body })
    resetDraft()
    await refreshTemplates()
  } catch (err) {
    templateError.value = apiErrorMessage(err, t('team.settings.templates.saveFailed'))
  } finally {
    templateBusy.value = false
  }
}

const removeTarget = ref<Template | null>(null)

async function removeTemplate() {
  const target = removeTarget.value
  if (!target) return
  templateBusy.value = true
  try {
    await apiRequest('/api/settings/templates/' + target.id, { method: 'DELETE' })
    removeTarget.value = null
    if (draft.id === target.id) resetDraft()
    await refreshTemplates()
  } catch (err) {
    templateError.value = apiErrorMessage(err, t('team.settings.templates.deleteFailed'))
    removeTarget.value = null
  } finally {
    templateBusy.value = false
  }
}

/* ------------------------------------------------------------------ users */

const userPage = ref(1)
const userSearch = ref('')
const userFilters = computed(() => ({
  page: userPage.value,
  limit: 20,
  search: userSearch.value || undefined
}))

interface Account {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  isActive: boolean
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  employee: { id: string, position: string } | null
  client: { id: string, name: string } | null
}

const {
  items: accounts,
  meta: accountMeta,
  errorMessage: accountError,
  refresh: refreshAccounts
} = useListResource<Account>('/api/users', userFilters as never)

const accountBusy = ref('')
const accountActionError = ref('')

async function updateAccount(row: Account, body: Record<string, unknown>) {
  accountBusy.value = row.id
  accountActionError.value = ''
  try {
    await apiRequest('/api/users/' + row.id, { method: 'PATCH', body })
    await refreshAccounts()
  } catch (err) {
    accountActionError.value = apiErrorMessage(err, t('team.settings.users.updateFailed'))
  } finally {
    accountBusy.value = ''
  }
}

const ROLES = Object.values(ROLE)
const isSelf = (row: Account) => row.id === auth.user?.id
</script>

<template>
  <div class="mx-auto max-w-5xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{{ t('team.settings.eyebrow') }}</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('team.settings.title') }}</h1>
      <p v-if="!canManage" class="mt-1 text-sm text-muted-foreground">
        {{ t('team.settings.readOnly') }}
      </p>

      <nav ref="tabStrip" class="scrollbar-none -mx-6 mt-4 flex gap-1 overflow-x-auto border-b px-6 sm:mx-0 sm:px-0">
        <button
          v-for="entry in visibleTabs"
          :key="entry.key"
          type="button"
          class="-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm"
          :class="tab === entry.key
            ? 'border-primary font-medium text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'"
          :aria-current="tab === entry.key ? 'page' : undefined"
          @click="tab = entry.key"
        >
          {{ t('team.settings.tabs.' + entry.key) }}
        </button>
      </nav>
    </header>

    <p
      v-if="saveError"
      role="alert"
      class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {{ saveError }}
    </p>
    <p
      v-else-if="saved"
      class="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm"
    >
      {{ t('common.states.saved') }}
    </p>

    <!-- ----------------------------------------------------------- studio -->
    <section v-if="tab === 'studio'" class="space-y-4">
      <div class="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.studio.name') }}</span>
          <input v-model="form.name" :disabled="!canManage" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60">
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.studio.legalName') }}</span>
          <input v-model="form.legalName" :disabled="!canManage" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60">
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.studio.email') }}</span>
          <input v-model="form.email" :disabled="!canManage" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60">
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.studio.phone') }}</span>
          <input v-model="form.phone" :disabled="!canManage" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60">
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.studio.website') }}</span>
          <input v-model="form.website" :disabled="!canManage" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60">
        </label>
        <label class="block sm:col-span-2">
          <span class="text-sm font-medium">{{ t('team.settings.studio.address') }}</span>
          <textarea v-model="form.address" :disabled="!canManage" rows="2" class="mt-1.5 w-full rounded-md border bg-background px-2.5 py-2 text-sm outline-none focus:border-ring disabled:opacity-60" />
        </label>
      </div>

      <div class="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.studio.currency') }}</span>
          <input v-model="form.currency" :disabled="!canManage" maxlength="3" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm uppercase outline-none focus:border-ring disabled:opacity-60">
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.studio.timezone') }}</span>
          <input v-model="form.timezone" :disabled="!canManage" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60">
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.studio.invoicePrefix') }}</span>
          <input v-model="form.invoicePrefix" :disabled="!canManage" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60">
          <span class="mt-1 block text-xs text-muted-foreground">{{ t('team.settings.studio.invoicePrefixHint') }}</span>
        </label>
      </div>

      <div class="rounded-xl border bg-card p-5">
        <label for="settings-default-language" class="text-sm font-medium">{{ t('team.settings.studio.defaultLanguage') }}</label>
        <div class="mt-1.5 max-w-xs">
          <LocaleSelect id="settings-default-language" v-model="defaultLanguage" :disabled="!canManage" />
        </div>
        <p class="mt-1.5 text-xs text-muted-foreground">{{ t('team.settings.studio.defaultLanguageHint') }}</p>
      </div>

      <button
        v-if="canManage"
        type="button"
        class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        :disabled="saving"
        @click="save(STUDIO_FIELDS)"
      >
        {{ saving ? t('common.actions.saving') : t('common.actions.save') }}
      </button>
    </section>

    <!-- --------------------------------------------------------- schedule -->
    <WorkSchedule v-else-if="tab === 'schedule'" :can-manage="canManage" />

    <!-- ------------------------------------------------------------- mail -->
    <section v-else-if="tab === 'mail'" class="space-y-4">
      <p class="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
        {{ t('team.settings.mail.intro') }}
      </p>

      <div class="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.mail.host') }}</span>
          <input v-model="form.smtpHost" :disabled="!canManage" :placeholder="t('team.settings.mail.hostPlaceholder')" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60">
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.mail.port') }}</span>
          <input v-model="form.smtpPort" :disabled="!canManage" type="number" placeholder="587" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60">
          <span class="mt-1 block text-xs text-muted-foreground">{{ t('team.settings.mail.portHint') }}</span>
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.mail.user') }}</span>
          <input v-model="form.smtpUser" :disabled="!canManage" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60">
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.mail.password') }}</span>
          <input
            v-model="smtpPassword"
            :disabled="!canManage"
            type="password"
            autocomplete="new-password"
            :placeholder="form.smtpPasswordSet ? t('team.settings.mail.passwordSet') : t('team.settings.mail.passwordUnset')"
            class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60"
          >
          <span class="mt-1 block text-xs text-muted-foreground">
            {{ t('team.settings.mail.passwordHint') }}
          </span>
        </label>
        <label class="block sm:col-span-2">
          <span class="text-sm font-medium">{{ t('team.settings.mail.from') }}</span>
          <input v-model="form.smtpFrom" :disabled="!canManage" :placeholder="t('team.settings.mail.fromPlaceholder')" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60">
        </label>
      </div>

      <div v-if="canManage" class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          :disabled="saving"
          @click="save(MAIL_FIELDS)"
        >
          {{ saving ? t('common.actions.saving') : t('common.actions.save') }}
        </button>
        <button
          type="button"
          class="h-9 rounded-md border px-4 text-sm hover:bg-secondary disabled:opacity-50"
          :disabled="testing"
          @click="testMail()"
        >
          {{ testing ? t('team.settings.mail.testing') : t('team.settings.mail.test') }}
        </button>
      </div>

      <p
        v-if="testResult"
        class="rounded-lg border px-4 py-2.5 text-sm"
        :class="testOk ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-signal/40 bg-signal/10'"
      >
        {{ testResult }}
      </p>
    </section>

    <!-- -------------------------------------------------------- templates -->
    <section v-else-if="tab === 'templates'" class="space-y-4">
      <p class="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
        {{ t('team.settings.templates.intro') }}
      </p>

      <div v-if="templates.length > 0" class="overflow-x-auto rounded-xl border bg-card">
        <table class="w-full text-sm">
          <tbody>
            <tr v-for="template in templates" :key="template.id" class="border-b last:border-0">
              <td class="px-5 py-3">
                <p class="font-medium">
                  {{ template.name }}
                  <span v-if="template.isDefault" class="ml-2 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-normal">
                    {{ t('team.settings.templates.default') }}
                  </span>
                </p>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ t('team.settings.templates.stagesLine', { count: countLabel(template.stages.length, 'team.settings.templates.stageCount'), stages: template.stages.join(' → ') }) }}
                </p>
              </td>
              <td v-if="canManage" class="w-36 px-5 py-3 text-right">
                <button type="button" class="text-sm text-muted-foreground hover:text-foreground" @click="editTemplate(template)">
                  {{ t('common.actions.edit') }}
                </button>
                <button type="button" class="ml-3 text-sm text-destructive hover:opacity-80" @click="removeTarget = template">
                  {{ t('common.actions.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="rounded-xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        {{ t('team.settings.templates.empty') }}
      </p>

      <div v-if="canManage" class="space-y-4 rounded-xl border bg-card p-5">
        <h2 class="text-sm font-medium">{{ draft.id ? t('team.settings.templates.editTitle') : t('team.settings.templates.newTitle') }}</h2>

        <p v-if="templateError" role="alert" class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {{ templateError }}
        </p>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="text-sm font-medium">{{ t('team.settings.templates.name') }}</span>
            <input v-model="draft.name" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring">
          </label>
          <label class="block">
            <span class="text-sm font-medium">{{ t('team.settings.templates.description') }}</span>
            <input v-model="draft.description" class="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring">
          </label>
        </div>

        <label class="block">
          <span class="text-sm font-medium">{{ t('team.settings.templates.stages') }}</span>
          <textarea v-model="draft.stages" rows="6" class="mt-1.5 w-full rounded-md border bg-background px-2.5 py-2 font-mono text-sm outline-none focus:border-ring" />
        </label>

        <label class="flex items-center gap-2 text-sm">
          <input v-model="draft.isDefault" type="checkbox" class="size-4">
          {{ t('team.settings.templates.isDefault') }}
        </label>

        <div class="flex gap-2">
          <button
            type="button"
            class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            :disabled="templateBusy || !draft.name.trim()"
            @click="saveTemplate()"
          >
            {{ draft.id ? t('common.actions.save') : t('common.actions.create') }}
          </button>
          <button v-if="draft.id" type="button" class="h-9 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground" @click="resetDraft()">
            {{ t('common.actions.cancel') }}
          </button>
        </div>
      </div>
    </section>

    <!-- ------------------------------------------------------------ users -->
    <section v-else-if="tab === 'users'" class="space-y-4">
      <p class="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
        <i18n-t keypath="team.settings.users.intro" tag="span" scope="global">
          <template #link>
            <NuxtLink to="/team/employees" class="text-foreground underline underline-offset-4">{{ t('team.settings.users.introLink') }}</NuxtLink>
          </template>
        </i18n-t>
      </p>

      <input
        v-model="userSearch"
        :placeholder="t('team.settings.users.search')"
        :aria-label="t('team.settings.users.search')"
        class="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring sm:max-w-sm"
        @input="userPage = 1"
      >

      <p v-if="accountError || accountActionError" role="alert" class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
        {{ accountActionError || accountError }}
      </p>

      <div class="overflow-x-auto rounded-xl border bg-card">
        <table class="w-full text-sm">
          <thead class="border-b bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th class="px-5 py-2.5 font-medium">{{ t('team.settings.users.columns.user') }}</th>
              <th class="px-5 py-2.5 font-medium">{{ t('team.settings.users.columns.role') }}</th>
              <th class="px-5 py-2.5 font-medium">{{ t('team.settings.users.columns.email') }}</th>
              <th class="px-5 py-2.5 font-medium">{{ t('team.settings.users.columns.access') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in accounts" :key="row.id" class="border-b last:border-0">
              <td class="px-5 py-3">
                <p class="font-medium">{{ row.firstName }} {{ row.lastName }}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ row.email }}
                  <template v-if="row.employee"> · {{ row.employee.position }}</template>
                  <template v-else-if="row.client"> · {{ t('team.settings.users.clientPortal', { client: row.client.name }) }}</template>
                  <template v-else> · {{ t('team.settings.users.noEmployee') }}</template>
                </p>
              </td>
              <td class="px-5 py-3">
                <select
                  :value="row.role"
                  :disabled="!canManageUsers || isSelf(row) || accountBusy === row.id"
                  :aria-label="t('team.settings.users.roleAria', { name: row.firstName + ' ' + row.lastName })"
                  class="h-8 rounded-md border bg-background px-2 text-sm outline-none focus:border-ring disabled:opacity-60"
                  @change="updateAccount(row, { role: ($event.target as HTMLSelectElement).value })"
                >
                  <option v-for="role in ROLES" :key="role" :value="role">
                    {{ enumLabel(ROLE_LABEL, role) }}
                  </option>
                </select>
              </td>
              <td class="px-5 py-3">
                <span v-if="row.emailVerifiedAt" class="text-xs text-muted-foreground">{{ t('team.settings.users.verified') }}</span>
                <button
                  v-else-if="canManageUsers"
                  type="button"
                  class="text-xs text-foreground underline underline-offset-4"
                  :disabled="accountBusy === row.id"
                  @click="updateAccount(row, { emailVerified: true })"
                >
                  {{ t('team.settings.users.verify') }}
                </button>
                <span v-else class="text-xs text-signal">{{ t('team.settings.users.unverified') }}</span>
              </td>
              <td class="px-5 py-3">
                <button
                  v-if="canManageUsers && !isSelf(row)"
                  type="button"
                  class="text-sm"
                  :class="row.isActive ? 'text-destructive hover:opacity-80' : 'text-foreground underline underline-offset-4'"
                  :disabled="accountBusy === row.id"
                  @click="updateAccount(row, { isActive: !row.isActive })"
                >
                  {{ row.isActive ? t('team.settings.users.disable') : t('team.settings.users.enable') }}
                </button>
                <span v-else class="text-xs text-muted-foreground">
                  {{ isSelf(row) ? t('team.settings.users.self') : (row.isActive ? t('team.settings.users.active') : t('team.settings.users.disabled')) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="accountMeta.pages > 1" class="flex items-center justify-between gap-3">
        <button type="button" class="h-9 rounded-md border px-3 text-sm disabled:opacity-40" :disabled="accountMeta.page <= 1" @click="userPage = accountMeta.page - 1">
          {{ t('common.actions.back') }}
        </button>
        <p class="text-sm text-muted-foreground">{{ t('team.pageOf', { page: accountMeta.page, pages: accountMeta.pages }) }}</p>
        <button type="button" class="h-9 rounded-md border px-3 text-sm disabled:opacity-40" :disabled="accountMeta.page >= accountMeta.pages" @click="userPage = accountMeta.page + 1">
          {{ t('team.nextPage') }}
        </button>
      </div>

    </section>

    <section v-else-if="tab === 'roles'">
      <RoleMatrix :can-edit="canEditRoles" />
    </section>

    <ConfirmDialog
      v-if="removeTarget"
      :title="t('team.settings.templates.deleteTitle')"
      :message="t('team.settings.templates.deleteMessage', { name: removeTarget.name })"
      :detail="t('team.settings.templates.deleteDetail')"
      :confirm-label="t('common.actions.delete')"
      :pending="templateBusy"
      @confirm="removeTemplate()"
      @cancel="removeTarget = null"
    />
  </div>
</template>
