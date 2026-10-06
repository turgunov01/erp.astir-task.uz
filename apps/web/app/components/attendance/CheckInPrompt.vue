<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useMyAttendance } from '~/composables/useMyAttendance'

/**
 * The morning reminder: when an employee opens the site without having
 * pressed «Я приехал», a small card offers the button. It never blocks the
 * page. A press closes it for good; «Позже» closes it for the rest of the
 * day — the header button stays for whoever still needs it.
 */

const { t } = useI18n()
const auth = useAuthStore()
const { day, busy, checkIn } = useMyAttendance()

const open = ref(false)

const storageKey = (date: string) => 'astir:check-in-prompt:' + (auth.user?.id ?? '') + ':' + date

/** Browser storage can be unavailable (private mode); then the card just shows. */
function dismissedToday(date: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(date)) === '1'
  } catch {
    return false
  }
}

function rememberDismissed(date: string) {
  try {
    window.localStorage.setItem(storageKey(date), '1')
  } catch {
    // Nothing to remember it in: the card may show again on the next visit.
  }
}

watch(day, (current) => {
  if (!current || current.checkedIn || current.corrected) {
    open.value = false
    return
  }
  if (!dismissedToday(current.date)) open.value = true
}, { immediate: true })

function later() {
  if (day.value) rememberDismissed(day.value.date)
  open.value = false
}

const startLine = computed(() =>
  day.value?.isWorkingDay
    ? t('shell.checkInPrompt.workdayStarts', { start: day.value.start })
    : t('shell.checkInPrompt.dayOff')
)
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
    leave-to-class="translate-y-3 opacity-0"
  >
    <aside
      v-if="open && day"
      class="fixed inset-x-4 bottom-20 z-40 rounded-xl border bg-card p-4 shadow-xl sm:inset-x-auto sm:right-6 sm:w-80 lg:bottom-6 print:hidden"
      role="status"
      aria-live="polite"
      aria-labelledby="check-in-prompt-title"
    >
      <div class="flex items-start gap-3">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-signal/20 text-amber-800 dark:text-signal">
          <Icon name="lucide:map-pin-check" class="size-5" />
        </span>
        <div class="min-w-0 flex-1">
          <p id="check-in-prompt-title" class="text-sm font-semibold">{{ t('shell.checkInPrompt.title') }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ t('shell.checkInPrompt.body') }} {{ startLine }}
          </p>
        </div>
      </div>
      <div class="mt-3 flex justify-end gap-2">
        <button
          type="button"
          class="h-8 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          @click="later()"
        >
          {{ t('common.actions.later') }}
        </button>
        <button
          type="button"
          class="flex h-8 items-center gap-1.5 rounded-md bg-signal px-3 text-sm font-semibold text-signal-foreground hover:brightness-105 disabled:opacity-70"
          :disabled="busy"
          @click="checkIn()"
        >
          <Icon name="lucide:map-pin-check" class="size-4" />
          {{ t('shell.checkIn.button') }}
        </button>
      </div>
    </aside>
  </Transition>
</template>
