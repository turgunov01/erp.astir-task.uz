<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useMyAttendance } from '~/composables/useMyAttendance'

/**
 * The whole-screen lock over the app, in two forms.
 *
 * PIN: the lock icon or «Пауза» was pressed. The page underneath is fully
 * covered (nothing of it shows through, that is the point of the PIN), and
 * the shift is on pause until the PIN — or, if forgotten, the account
 * password — is entered.
 *
 * Closed: outside the working hours (before the shift, after it, a day off,
 * or once «Закончить смену» was pressed) the app is closed until the next
 * shift opens. The owner and administrators are exempt from this one.
 *
 * Both come from the server, so a reload or another tab does not get around
 * them; the clock here only notices the shift opening or closing on time.
 */

const { t, locale } = useI18n()
const auth = useAuthStore()
const { day, lockState, enabled, load, unlock } = useMyAttendance()

const REFRESH_MS = 60_000
const TICK_MS = 15_000
const PIN_LENGTH_MIN = 4
const PIN_LENGTH_MAX = 6

const now = ref(Date.now())
let refresher: ReturnType<typeof setInterval> | null = null
let ticker: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  refresher = setInterval(() => { if (enabled.value) load() }, REFRESH_MS)
  ticker = setInterval(() => { now.value = Date.now() }, TICK_MS)
})
onBeforeUnmount(() => {
  if (refresher) clearInterval(refresher)
  if (ticker) clearInterval(ticker)
})

const shift = computed(() => lockState.value?.shift ?? null)
const tz = computed(() => day.value?.timezone ?? 'Asia/Tashkent')

/** Past a boundary the server named: ask it again rather than guess. */
watch(now, value => {
  const current = shift.value
  if (!current) return
  const boundary = current.state === 'OPEN' ? current.endsAt : current.opensAt
  if (boundary && value >= new Date(boundary).getTime()) load()
})

/** Closed for work: outside the shift, or the shift was ended today. */
const closed = computed(() => {
  if (!enabled.value || !day.value || !lockState.value || lockState.value.windowExempt) return false
  return lockState.value.shift.state !== 'OPEN' || day.value.checkedOut
})
const pinLocked = computed(() => Boolean(enabled.value && lockState.value?.locked))
const visible = computed(() => closed.value || pinLocked.value)
const paused = computed(() => Boolean(day.value?.paused && !day.value.checkedOut))

const opensLabel = computed(() => {
  const opensAt = shift.value?.opensAt
  if (!opensAt) return ''
  return new Intl.DateTimeFormat(locale.value, {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: tz.value
  }).format(new Date(opensAt))
})

const closedTitle = computed(() => {
  const state = shift.value?.state
  if (state === 'BEFORE') return t('shell.lock.closedBefore')
  if (state === 'DAY_OFF') return t('shell.lock.closedDayOff')
  return t('shell.lock.closedAfter')
})

const closedBody = computed(() => {
  const current = shift.value
  if (!current) return ''
  if (current.state === 'OPEN') return t('shell.lock.closedEndedEarly')
  if (current.state === 'BEFORE') return t('shell.lock.closedBeforeBody', { start: current.start })
  return t('shell.lock.closedHours', { start: current.start, end: current.end })
})

/* ---- PIN form ---- */

const usePassword = ref(false)
const pin = ref('')
const password = ref('')
const submitting = ref(false)
const formError = ref('')
const pinInput = ref<HTMLInputElement | null>(null)

watch(pinLocked, value => {
  if (!value) return
  pin.value = ''
  password.value = ''
  formError.value = ''
  usePassword.value = false
  nextTick(() => pinInput.value?.focus())
}, { immediate: true })

function onPinInput(event: Event) {
  pin.value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, PIN_LENGTH_MAX)
  formError.value = ''
}

async function submit() {
  if (submitting.value) return
  if (usePassword.value ? !password.value : pin.value.length < PIN_LENGTH_MIN) {
    formError.value = usePassword.value ? t('shell.lock.passwordEmpty') : t('shell.lock.pinShort')
    return
  }
  submitting.value = true
  formError.value = await unlock(usePassword.value ? { password: password.value } : { pin: pin.value })
  submitting.value = false
  if (formError.value) {
    pin.value = ''
    nextTick(() => pinInput.value?.focus())
  }
}

/** A click anywhere on the lock screen puts the cursor back in the PIN. */
function focusPin(event: MouseEvent) {
  if (usePassword.value) return
  const target = event.target as HTMLElement
  if (target.closest('button, a, input')) return
  pinInput.value?.focus()
}

function switchToPassword(on: boolean) {
  usePassword.value = on
  formError.value = ''
  if (!on) nextTick(() => pinInput.value?.focus())
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-background px-4 py-10"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="closed ? 'shift-closed-title' : 'screen-lock-title'"
      @click="focusPin"
    >
      <!-- A quiet dot grid so the cover reads as a deliberate screen, not a blank page. -->
      <div
        class="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:22px_22px]"
        aria-hidden="true"
      />

      <section v-if="closed" class="relative w-full max-w-sm text-center">
        <div class="mx-auto grid size-14 place-items-center rounded-2xl border bg-card shadow-sm">
          <Icon name="lucide:moon-star" class="size-6 text-muted-foreground" />
        </div>
        <h1 id="shift-closed-title" class="mt-5 text-xl font-semibold tracking-tight">{{ closedTitle }}</h1>
        <p class="mt-2 text-sm text-muted-foreground">{{ closedBody }}</p>
        <div v-if="opensLabel" class="mx-auto mt-5 rounded-xl border bg-card px-4 py-3 shadow-sm">
          <p class="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{{ t('shell.lock.nextShift') }}</p>
          <p class="mt-1 text-base font-semibold tabular-nums first-letter:uppercase">{{ opensLabel }}</p>
        </div>
        <p class="mt-4 text-xs text-muted-foreground">{{ t('shell.lock.closedNote') }}</p>
        <button
          type="button"
          class="mt-6 inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm hover:bg-secondary"
          @click="auth.logout()"
        >
          <Icon name="lucide:log-out" class="size-4" />
          {{ t('shell.userMenu.logout') }}
        </button>
      </section>

      <form v-else class="relative w-full max-w-xs text-center" @submit.prevent="submit()">
        <div class="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md">
          <Icon name="lucide:lock" class="size-6" />
        </div>
        <h1 id="screen-lock-title" class="mt-5 text-xl font-semibold tracking-tight">{{ t('shell.lock.lockedTitle') }}</h1>
        <p v-if="auth.user" class="mt-1 text-sm text-muted-foreground">{{ auth.user.firstName }} {{ auth.user.lastName }}</p>
        <p
          v-if="paused"
          class="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-400/15 dark:text-amber-200"
        >
          <Icon name="lucide:pause" class="size-3" />
          {{ t('shell.lock.pausedNote') }}
        </p>

        <template v-if="!usePassword">
          <label for="screen-lock-pin" class="sr-only">{{ t('shell.lock.pinLabel') }}</label>
          <div class="relative mx-auto mt-6 w-fit rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
            <div class="flex justify-center gap-2.5" aria-hidden="true">
              <span
                v-for="n in PIN_LENGTH_MAX"
                :key="n"
                class="size-3.5 rounded-full border-2 transition-colors"
                :class="n <= pin.length ? 'border-primary bg-primary' : 'border-muted-foreground/40'"
              />
            </div>
            <input
              id="screen-lock-pin"
              ref="pinInput"
              :value="pin"
              type="password"
              inputmode="numeric"
              autocomplete="off"
              :maxlength="PIN_LENGTH_MAX"
              class="absolute inset-0 w-full cursor-text opacity-0"
              @input="onPinInput"
            >
          </div>
          <p class="mt-3 text-xs text-muted-foreground">{{ t('shell.lock.pinHint') }}</p>
        </template>
        <label v-else class="mt-6 block text-left text-sm">
          <span class="mb-1.5 block text-xs text-muted-foreground">{{ t('shell.lock.passwordLabel') }}</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:border-ring"
            autofocus
          >
        </label>

        <p v-if="formError" role="alert" class="mt-3 text-sm text-destructive">{{ formError }}</p>

        <button
          type="submit"
          class="mt-5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          :disabled="submitting"
        >
          <Icon :name="submitting ? 'lucide:loader-circle' : 'lucide:lock-open'" class="size-4" :class="submitting ? 'animate-spin' : ''" />
          {{ paused ? t('shell.lock.unlockResume') : t('shell.lock.unlock') }}
        </button>

        <div class="mt-4 flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            class="rounded px-1 py-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            @click="switchToPassword(!usePassword)"
          >
            {{ usePassword ? t('shell.lock.usePin') : t('shell.lock.forgotPin') }}
          </button>
          <button
            type="button"
            class="rounded px-1 py-0.5 text-muted-foreground hover:text-foreground"
            @click="auth.logout()"
          >
            {{ t('shell.userMenu.logout') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
