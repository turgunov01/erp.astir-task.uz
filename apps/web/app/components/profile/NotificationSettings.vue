<script setup lang="ts">
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

/**
 * Which notifications reach me, and how.
 *
 * Each switch saves on its own the moment it is flipped: a preferences list
 * with a separate Save button invites leaving the page with changes unsaved.
 * The flip shows at once and is put back if the server refuses it.
 */

interface Preference {
  type: string
  inApp: boolean
  /** null: this type never sends a letter. */
  email: boolean | null
}

type Channel = 'IN_APP' | 'EMAIL'

const auth = useAuthStore()

const { data, pending, error: loadError, refresh } = await useFetch<{ data: Preference[] }>(
  '/api/notifications/preferences',
  { credentials: 'include' }
)

/** Catalogue order, so the types the client asked about come first. */
const ORDER = Object.keys(NOTIFICATION_TYPE_LABEL)

const rows = computed(() =>
  [...(data.value?.data ?? [])].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
)

const saving = ref('')
const saveError = ref('')

function replaceRow(type: string, patch: Partial<Preference>) {
  if (!data.value) return
  data.value = {
    data: data.value.data.map(row => (row.type === type ? { ...row, ...patch } : row))
  }
}

async function toggle(row: Preference, channel: Channel) {
  const key = channel === 'IN_APP' ? 'inApp' : 'email'
  const previous = row[key]
  if (previous === null) return
  const enabled = !previous

  saving.value = row.type + ':' + channel
  saveError.value = ''
  replaceRow(row.type, { [key]: enabled })
  try {
    const result = await apiRequest<{ data: Preference[] }>('/api/notifications/preferences', {
      method: 'PUT',
      body: { preferences: [{ type: row.type, channel, enabled }] }
    })
    data.value = result
  } catch (err) {
    replaceRow(row.type, { [key]: previous })
    saveError.value = apiErrorMessage(err, 'Не удалось сохранить настройку')
  } finally {
    saving.value = ''
  }
}

function label(type: string) {
  return NOTIFICATION_TYPE_LABEL[type] ?? { title: type, hint: '' }
}
</script>

<template>
  <section class="mb-6 rounded-xl border bg-card p-5" aria-labelledby="notification-settings">
    <h2 id="notification-settings" class="text-sm font-medium">Уведомления</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      Что приходит в колокольчик и что — письмом на {{ auth.user?.email }}.
      Изменения сохраняются сразу.
    </p>

    <p v-if="saveError" role="alert" class="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
      {{ saveError }}
    </p>

    <div v-if="pending && !rows.length" class="mt-4 space-y-2" aria-hidden="true">
      <div v-for="n in 4" :key="n" class="h-11 animate-pulse rounded-md bg-secondary/60" />
    </div>

    <div v-else-if="loadError" class="mt-4 flex flex-wrap items-center gap-3 text-sm text-destructive">
      Не удалось загрузить настройки уведомлений.
      <button type="button" class="h-8 rounded-md border px-3 text-foreground hover:bg-secondary" @click="refresh()">
        Повторить
      </button>
    </div>

    <table v-else class="mt-4 w-full text-sm">
      <thead>
        <tr class="text-xs text-muted-foreground">
          <th scope="col" class="pb-2 text-left font-normal">Событие</th>
          <th scope="col" class="w-20 pb-2 text-center font-normal sm:w-28">В приложении</th>
          <th scope="col" class="w-16 pb-2 text-center font-normal sm:w-24">Почта</th>
        </tr>
      </thead>
      <tbody class="divide-y">
        <tr v-for="row in rows" :key="row.type">
          <th scope="row" class="py-2.5 pr-3 text-left font-normal">
            <span class="block font-medium">{{ label(row.type).title }}</span>
            <span class="block text-xs text-muted-foreground">{{ label(row.type).hint }}</span>
          </th>
          <td class="py-2.5 text-center">
            <button
              type="button"
              role="switch"
              :aria-checked="row.inApp"
              :aria-label="label(row.type).title + ': в приложении'"
              class="pref-switch"
              :disabled="saving === row.type + ':IN_APP'"
              @click="toggle(row, 'IN_APP')"
            >
              <span class="pref-switch-thumb" />
            </button>
          </td>
          <td class="py-2.5 text-center">
            <button
              v-if="row.email !== null"
              type="button"
              role="switch"
              :aria-checked="row.email"
              :aria-label="label(row.type).title + ': письмом'"
              class="pref-switch"
              :disabled="saving === row.type + ':EMAIL'"
              @click="toggle(row, 'EMAIL')"
            >
              <span class="pref-switch-thumb" />
            </button>
            <span v-else class="text-xs text-muted-foreground" title="Для этого события письма не отправляются">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.pref-switch {
  position: relative;
  display: inline-flex;
  width: 2.25rem;
  height: 1.25rem;
  flex-shrink: 0;
  align-items: center;
  border-radius: 9999px;
  /* Off must read as "off", not as "disabled": a visible track, not a ghost. */
  background: color-mix(in oklch, var(--muted-foreground) 35%, transparent);
  border: 1px solid transparent;
  transition: background-color 150ms ease;
  vertical-align: middle;
}

.pref-switch[aria-checked='true'] {
  background: var(--primary);
  border-color: transparent;
}

.pref-switch:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.pref-switch:disabled {
  opacity: 0.6;
}

.pref-switch-thumb {
  display: block;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 9999px;
  background: var(--background);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
  transform: translateX(0.1875rem);
  transition: transform 150ms ease;
}

.pref-switch[aria-checked='true'] .pref-switch-thumb {
  background: var(--primary-foreground);
  transform: translateX(1.0625rem);
}
</style>
