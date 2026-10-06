<script setup lang="ts">
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import type { AttendanceDayFields, AttendancePerson } from '~/utils/attendance'

/**
 * Correct one employee's day by hand: arrival, departure and a mandatory
 * reason. What the app observed on its own stays visible next to the form,
 * and a corrected day can be returned to the observed times.
 */

const props = defineProps<{
  person: AttendancePerson
  date: string
  day: AttendanceDayFields
  timezone: string
}>()

const emit = defineEmits<{ (e: 'saved'): void, (e: 'cancel'): void }>()
const { t } = useI18n()

const clockOrEmpty = (value: string | null) => (value ? studioClock(value, props.timezone) : '')

const form = reactive({
  checkIn: clockOrEmpty(props.day.checkInAt),
  checkOut: clockOrEmpty(props.day.checkOutAt),
  comment: ''
})

const busy = ref(false)
const error = ref('')

const endpoint = computed(() =>
  '/api/attendance/employees/' + props.person.id + '/days/' + props.date
)

async function save() {
  busy.value = true
  error.value = ''
  try {
    await apiRequest(endpoint.value, {
      method: 'PUT',
      body: {
        checkIn: form.checkIn || null,
        checkOut: form.checkOut || null,
        comment: form.comment
      }
    })
    emit('saved')
  } catch (err) {
    error.value = apiErrorMessage(err, t('team.correct.saveFailed'))
  } finally {
    busy.value = false
  }
}

async function reset() {
  busy.value = true
  error.value = ''
  try {
    await apiRequest(endpoint.value + '/correction', { method: 'DELETE' })
    emit('saved')
  } catch (err) {
    error.value = apiErrorMessage(err, t('team.correct.resetFailed'))
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') emit('cancel')
  }
  window.addEventListener('keydown', handler)
  onBeforeUnmount(() => window.removeEventListener('keydown', handler))
})

const inputClass = 'mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring'
</script>

<template>
  <div
    class="fixed inset-0 z-[60] grid place-items-center px-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="attendance-correct-title"
  >
    <div class="drawer-scrim absolute inset-0 bg-black/50" @click="emit('cancel')" />

    <form
      class="dialog-panel relative w-full max-w-md overflow-hidden rounded-xl border bg-background shadow-xl"
      @submit.prevent="save()"
    >
      <div class="space-y-4 px-6 py-5">
        <div>
          <h2 id="attendance-correct-title" class="text-base font-semibold tracking-tight">
            {{ t('team.correct.title') }}
          </h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ props.person.user.firstName }} {{ props.person.user.lastName }} · {{ shortDate(props.date) }}
          </p>
        </div>

        <p class="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          <i18n-t keypath="team.correct.observed" tag="span" scope="global">
            <template #first>
              <span class="font-medium text-foreground tabular-nums">{{ studioClock(props.day.firstSeenAt, props.timezone) }}</span>
            </template>
            <template #last>
              <span class="font-medium text-foreground tabular-nums">{{ studioClock(props.day.lastSeenAt, props.timezone) }}</span>
            </template>
          </i18n-t>
          <template v-if="props.day.source === 'MANUAL' && props.day.comment">
            <br>{{ t('team.correct.previous', { comment: props.day.comment }) }}
          </template>
        </p>

        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="text-sm font-medium">{{ t('team.days.columns.checkIn') }}</span>
            <input v-model="form.checkIn" type="time" :class="inputClass">
          </label>
          <label class="block">
            <span class="text-sm font-medium">{{ t('team.days.columns.checkOut') }}</span>
            <input v-model="form.checkOut" type="time" :class="inputClass">
          </label>
        </div>
        <p class="-mt-2 text-xs text-muted-foreground">
          {{ t('team.correct.emptyHint') }}
        </p>

        <label class="block">
          <span class="text-sm font-medium">{{ t('team.correct.reason') }}</span>
          <textarea
            v-model="form.comment"
            rows="2"
            required
            minlength="3"
            maxlength="500"
            :placeholder="t('team.correct.reasonPlaceholder')"
            class="mt-1.5 w-full rounded-md border bg-background px-2.5 py-2 text-sm outline-none focus:border-ring"
          />
        </label>

        <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2 border-t bg-card px-6 py-3">
        <button
          v-if="props.day.source === 'MANUAL'"
          type="button"
          class="mr-auto text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          :disabled="busy"
          @click="reset()"
        >
          {{ t('team.correct.reset') }}
        </button>
        <button
          type="button"
          class="h-9 rounded-md border px-4 text-sm hover:bg-secondary"
          @click="emit('cancel')"
        >
          {{ t('common.actions.cancel') }}
        </button>
        <button
          type="submit"
          class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          :disabled="busy || form.comment.trim().length < 3"
        >
          {{ busy ? t('common.actions.saving') : t('common.actions.save') }}
        </button>
      </div>
    </form>
  </div>
</template>
