<script setup lang="ts">
import { apiErrorMessage, apiRequest } from '~/composables/useApi'

/**
 * Настройки → Рабочий график: the schedule attendance control measures
 * against (start, end, grace, working weekdays) and the lateness fine rates.
 */

const props = defineProps<{ canManage: boolean }>()
const { t } = useI18n()

interface ScheduleSettings {
  currency: string
  workDayStart: string
  workDayEnd: string
  lateGraceMinutes: number
  workWeekdays: number[]
  /** Decimals arrive as strings. */
  latePenaltyPerDay: string | number
  latePenaltyPerMinute: string | number
}

/** ISO weekdays, Monday first; names come from common.weekdayShort. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

const { data, refresh } = useFetch<{ data: ScheduleSettings }>('/api/settings', { credentials: 'include' })

const form = reactive({
  workDayStart: '09:00',
  workDayEnd: '18:00',
  lateGraceMinutes: 10,
  workWeekdays: [1, 2, 3, 4, 5] as number[],
  latePenaltyPerDay: 0,
  latePenaltyPerMinute: 0
})

watchEffect(() => {
  const loaded = data.value?.data
  if (!loaded) return
  form.workDayStart = loaded.workDayStart
  form.workDayEnd = loaded.workDayEnd
  form.lateGraceMinutes = loaded.lateGraceMinutes
  form.workWeekdays = [...loaded.workWeekdays]
  form.latePenaltyPerDay = Number(loaded.latePenaltyPerDay)
  form.latePenaltyPerMinute = Number(loaded.latePenaltyPerMinute)
})

const currency = computed(() => data.value?.data.currency ?? '')

function toggleDay(day: number) {
  form.workWeekdays = form.workWeekdays.includes(day)
    ? form.workWeekdays.filter(value => value !== day)
    : [...form.workWeekdays, day].sort((a, b) => a - b)
}

/** What a 25-minute lateness would cost, so the rates read as money. */
const example = computed(() => {
  const amount = Number(form.latePenaltyPerDay || 0) + Number(form.latePenaltyPerMinute || 0) * 25
  return Math.round(amount * 100) / 100
})

const saving = ref(false)
const error = ref('')
const saved = ref(false)

async function save() {
  saving.value = true
  error.value = ''
  saved.value = false
  try {
    await apiRequest('/api/settings', { method: 'PATCH', body: { ...form } })
    saved.value = true
    await refresh()
  } catch (err) {
    error.value = apiErrorMessage(err, t('team.schedule.saveFailed'))
  } finally {
    saving.value = false
  }
}

const inputClass = 'mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60'
</script>

<template>
  <section class="space-y-4">
    <p class="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
      {{ t('team.schedule.intro') }}
    </p>

    <p
      v-if="error"
      role="alert"
      class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {{ error }}
    </p>
    <p
      v-else-if="saved"
      class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm"
    >
      {{ t('team.schedule.saved') }}
    </p>

    <div class="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
      <label class="block">
        <span class="text-sm font-medium">{{ t('team.schedule.start') }}</span>
        <input v-model="form.workDayStart" type="time" :disabled="!props.canManage" :class="inputClass">
      </label>
      <label class="block">
        <span class="text-sm font-medium">{{ t('team.schedule.end') }}</span>
        <input v-model="form.workDayEnd" type="time" :disabled="!props.canManage" :class="inputClass">
      </label>
      <label class="block">
        <span class="text-sm font-medium">{{ t('team.schedule.grace') }}</span>
        <input v-model.number="form.lateGraceMinutes" type="number" min="0" max="240" :disabled="!props.canManage" :class="inputClass">
        <span class="mt-1 block text-xs text-muted-foreground">
          {{ t('team.schedule.graceHint', { start: form.workDayStart }) }}
        </span>
      </label>

      <fieldset class="sm:col-span-3">
        <legend class="text-sm font-medium">{{ t('team.schedule.weekdays') }}</legend>
        <div class="mt-1.5 flex flex-wrap gap-1.5">
          <button
            v-for="day in WEEKDAYS"
            :key="day"
            type="button"
            :disabled="!props.canManage"
            class="h-9 min-w-11 rounded-md border px-3 text-sm transition-colors disabled:opacity-60"
            :class="form.workWeekdays.includes(day)
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-secondary'"
            :aria-pressed="form.workWeekdays.includes(day)"
            @click="toggleDay(day)"
          >
            {{ weekdayShort(day) }}
          </button>
        </div>
      </fieldset>
    </div>

    <div class="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
      <label class="block">
        <span class="text-sm font-medium">{{ t('team.schedule.penaltyPerDay', { currency }) }}</span>
        <input v-model.number="form.latePenaltyPerDay" type="number" min="0" step="0.01" :disabled="!props.canManage" :class="inputClass">
      </label>
      <label class="block">
        <span class="text-sm font-medium">{{ t('team.schedule.penaltyPerMinute', { currency }) }}</span>
        <input v-model.number="form.latePenaltyPerMinute" type="number" min="0" step="0.01" :disabled="!props.canManage" :class="inputClass">
      </label>
      <p class="text-xs text-muted-foreground sm:col-span-2">
        {{ t('team.schedule.penaltyHint', { amount: example, currency }) }}
      </p>
    </div>

    <button
      v-if="props.canManage"
      type="button"
      class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      :disabled="saving"
      @click="save()"
    >
      {{ saving ? t('common.actions.saving') : t('team.schedule.save') }}
    </button>
  </section>
</template>
