<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useMyAttendance } from '~/composables/useMyAttendance'

/**
 * «Начните смену» — the gate in front of the working day.
 *
 * For an employee the app is closed until the shift is started: a modal in
 * the middle of the screen covers everything, the page under it is inert,
 * and the only actions are «Начать смену» and «Выйти». It shows only while
 * the shift can actually start (inside the working window, not yet checked
 * in, the day not corrected by an administrator).
 *
 * The owner and administrators (exempt from the working window) are not
 * shut out: they get the small dismissable card instead.
 */

const { t } = useI18n()
const auth = useAuthStore()
const { day, lockState, busy, error, checkIn } = useMyAttendance()

const dismissed = ref(false)

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

/** The shift could start now and has not. */
const due = computed(() => {
  const current = day.value
  return Boolean(current && !current.checkedIn && !current.corrected && lockState.value?.shift.state === 'OPEN')
})
const exempt = computed(() => Boolean(lockState.value?.windowExempt))
/** Employees: the whole app waits for «Начать смену». */
const blocking = computed(() => due.value && !exempt.value && !lockState.value?.locked)
const card = computed(() => due.value && exempt.value && !dismissed.value)

watch(day, current => {
  dismissed.value = current && import.meta.client ? dismissedToday(current.date) : false
}, { immediate: true })

function later() {
  if (day.value) rememberDismissed(day.value.date)
  dismissed.value = true
}

const startLine = computed(() =>
  day.value?.isWorkingDay
    ? t('shell.checkInPrompt.workdayStarts', { start: day.value.start })
    : t('shell.checkInPrompt.dayOff')
)

/* While the gate is up nothing behind it can be clicked, tabbed to or read out. */
const startButton = ref<HTMLButtonElement | null>(null)
watch(blocking, value => {
  if (!import.meta.client) return
  document.getElementById('__nuxt')?.toggleAttribute('inert', value)
  if (value) nextTick(() => startButton.value?.focus())
}, { immediate: true })
onBeforeUnmount(() => {
  if (import.meta.client) document.getElementById('__nuxt')?.removeAttribute('inert')
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <div
        v-if="blocking && day"
        class="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-background/75 px-4 py-10 backdrop-blur-md print:hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-in-gate-title"
        aria-describedby="check-in-gate-body"
      >
        <section class="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-2xl">
          <div class="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-600 text-white shadow-md">
            <Icon name="lucide:play" class="size-6" />
          </div>
          <h1 id="check-in-gate-title" class="mt-5 text-xl font-semibold tracking-tight">{{ t('shell.checkInPrompt.title') }}</h1>
          <p v-if="auth.user" class="mt-1 text-sm text-muted-foreground">{{ auth.user.firstName }} {{ auth.user.lastName }}</p>
          <p id="check-in-gate-body" class="mt-3 text-sm text-muted-foreground">
            {{ t('shell.checkInPrompt.body') }} {{ startLine }}
          </p>
          <p class="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
            {{ t('shell.checkInPrompt.gateNote') }}
          </p>

          <p v-if="error" role="alert" class="mt-3 text-sm text-destructive">{{ error }}</p>

          <button
            ref="startButton"
            type="button"
            class="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 text-base font-semibold text-white shadow-sm transition-[transform,background-color] hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70"
            :disabled="busy"
            @click="checkIn()"
          >
            <Icon :name="busy ? 'lucide:loader-circle' : 'lucide:play'" class="size-5" :class="busy ? 'motion-safe:animate-spin' : ''" />
            {{ t('shell.checkIn.button') }}
          </button>
          <button
            type="button"
            class="mt-3 inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            @click="auth.logout()"
          >
            <Icon name="lucide:log-out" class="size-3.5" />
            {{ t('shell.userMenu.logout') }}
          </button>
        </section>
      </div>
    </Transition>
  </Teleport>

  <Transition
    enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
    leave-to-class="translate-y-3 opacity-0"
  >
    <aside
      v-if="card && day"
      class="fixed inset-x-4 bottom-20 z-40 rounded-xl border bg-card p-4 shadow-xl sm:inset-x-auto sm:right-6 sm:w-80 lg:bottom-6 print:hidden"
      role="status"
      aria-live="polite"
      aria-labelledby="check-in-prompt-title"
    >
      <div class="flex items-start gap-3">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-signal/20 text-amber-800 dark:text-signal">
          <Icon name="lucide:play" class="size-5" />
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
          class="flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-70"
          :disabled="busy"
          @click="checkIn()"
        >
          <Icon name="lucide:play" class="size-4" />
          {{ t('shell.checkIn.button') }}
        </button>
      </div>
    </aside>
  </Transition>
</template>
