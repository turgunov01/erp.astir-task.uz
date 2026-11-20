<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useMyAttendance } from '~/composables/useMyAttendance'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'

/**
 * The employee's shift, next to the notification bell.
 *
 * «Начать смену» is the one coloured control in the header until it is
 * pressed. Then the shift shows as a quiet status («На смене с 09:05») with
 * «Пауза» and «Закончить смену» beside it. «Пауза» and the lock icon lock the
 * screen (ScreenLock): the PIN resumes the shift. The
 * status menu shows the arrival, lateness, time on pause (taken off the
 * worked time) and the net worked time.
 */

const { t } = useI18n()
const auth = useAuthStore()
const { day, lockState, pinSetup, enabled, busy, error, load, checkIn, checkOut, pause, lock } = useMyAttendance()

/** A shift can only start inside the schedule hours; outside them the button explains why. */
const closedReason = computed(() => {
  const shift = lockState.value?.shift
  if (!shift || shift.state === 'OPEN') return ''
  if (shift.state === 'BEFORE') return t('shell.lock.startsAt', { time: shift.start })
  if (shift.state === 'AFTER') return t('shell.lock.endedAt', { time: shift.end })
  return t('shell.lock.dayOff')
})

function changePin() {
  pinSetup.value = { open: true, lockAfter: false }
}

const tz = computed(() => day.value?.timezone ?? 'Asia/Tashkent')
const arrival = computed(() => studioClock(day.value?.checkInAt, tz.value))
const departure = computed(() => studioClock(day.value?.checkOutAt, tz.value))
const pauseStart = computed(() => studioClock(day.value?.pausedAt, tz.value))
const needsPress = computed(() => Boolean(day.value && !day.value.checkedIn && !day.value.corrected))
const isLate = computed(() => (day.value?.lateMinutes ?? 0) > 0)
/** The shift runs (or is paused) and the buttons still own it. */
const onShift = computed(() => Boolean(day.value?.checkedIn && !day.value.checkedOut && !day.value.corrected))
const paused = computed(() => Boolean(onShift.value && day.value?.paused))

/* A clock for the live figures: pause length and worked time so far. */
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null

const minutesSince = (iso: string | null | undefined) =>
  iso ? Math.max(0, Math.floor((now.value - new Date(iso).getTime()) / 60_000)) : 0

/** The running pause alone. */
const currentPause = computed(() => (paused.value ? minutesSince(day.value?.pausedAt) : 0))
/** Every pause today, the running one included. */
const totalPause = computed(() => {
  const current = day.value
  if (!current) return 0
  if (!onShift.value) return current.pausedMinutes
  return current.finishedPauseMinutes + currentPause.value
})
/** Worked time with the pauses already taken off. */
const worked = computed(() => {
  const current = day.value
  if (!current) return 0
  if (!onShift.value) return current.workedMinutes
  return Math.max(0, minutesSince(current.checkInAt) - totalPause.value)
})

/** The trigger's words, full on a desktop and short on a phone. */
const status = computed(() => {
  const current = day.value
  if (!current?.checkedIn) return { full: t('shell.checkIn.corrected'), short: t('shell.checkIn.correctedShort') }
  if (current.checkedOut) {
    return {
      full: t('shell.checkIn.leftAt', { time: departure.value }),
      short: t('shell.checkIn.leftShort', { time: departure.value })
    }
  }
  if (paused.value) {
    const duration = formatMinutes(currentPause.value) === '—' ? t('shell.checkIn.justNow') : formatMinutes(currentPause.value)
    return {
      full: t('shell.checkIn.pausedFor', { duration }),
      short: t('shell.checkIn.pausedShort')
    }
  }
  return {
    full: t('shell.checkIn.atWorkSince', { time: arrival.value }),
    short: t('shell.checkIn.sinceShort', { time: arrival.value })
  }
})

/* A page left open overnight must not keep showing yesterday's marks. */
function onVisible() {
  if (document.visibilityState === 'visible') {
    now.value = Date.now()
    load()
  }
}
onMounted(() => {
  load()
  document.addEventListener('visibilitychange', onVisible)
  clock = setInterval(() => { now.value = Date.now() }, 30_000)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  if (clock) clearInterval(clock)
})
watch(() => auth.user?.id, () => load())
watch(day, () => { now.value = Date.now() })

/* The error bubble goes away on its own; the state was reloaded already. */
const ERROR_MS = 6000
let errorTimer: ReturnType<typeof setTimeout> | null = null
watch(error, (message) => {
  if (errorTimer) clearTimeout(errorTimer)
  if (message) errorTimer = setTimeout(() => { error.value = '' }, ERROR_MS)
})
</script>

<template>
  <div v-if="enabled && day" class="relative flex items-center gap-1">
    <button
      v-if="needsPress"
      type="button"
      class="group relative flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm sm:px-3 bg-emerald-600 font-semibold text-white hover:bg-emerald-700 shadow-sm transition-[transform,background-color] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70"
      :disabled="busy || Boolean(closedReason)"
      :aria-label="t('shell.checkIn.buttonAria')"
      :title="closedReason || t('shell.checkIn.buttonTitle')"
      @click="checkIn()"
    >
      <span class="absolute -right-1 -top-1 flex size-2.5" aria-hidden="true">
        <span class="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-75 motion-safe:animate-ping" />
        <span class="relative inline-flex size-2.5 rounded-full border-2 border-card bg-emerald-500" />
      </span>
      <Icon :name="busy ? 'lucide:loader-circle' : 'lucide:play'" class="size-4" :class="busy ? 'motion-safe:animate-spin' : ''" />
      <span class="whitespace-nowrap">{{ t('shell.checkIn.button') }}</span>
    </button>

    <template v-else>
      <!-- «Пауза» / «Продолжить смену» stay one click away while the shift runs. -->
      <button
        v-if="onShift && !paused"
        type="button"
        class="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm sm:px-2.5 bg-amber-400 font-semibold text-amber-950 hover:bg-amber-500 shadow-sm transition-[transform,background-color] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70"
        :disabled="busy"
        :aria-label="t('shell.checkIn.pause')"
        :title="t('shell.checkIn.pauseTitle')"
        @click="pause()"
      >
        <Icon :name="busy ? 'lucide:loader-circle' : 'lucide:pause'" class="size-4" :class="busy ? 'motion-safe:animate-spin' : ''" />
        <span class="hidden whitespace-nowrap sm:inline">{{ t('shell.checkIn.pause') }}</span>
      </button>
      <button
        v-if="onShift"
        type="button"
        class="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm sm:px-2.5 bg-red-600 font-semibold text-white hover:bg-red-700 shadow-sm transition-[transform,background-color] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70"
        :disabled="busy"
        :aria-label="t('shell.checkIn.checkOut')"
        :title="t('shell.checkIn.checkOutTitle')"
        @click="checkOut()"
      >
        <Icon name="lucide:square" class="size-4" />
        <span class="hidden whitespace-nowrap sm:inline">{{ t('shell.checkIn.checkOut') }}</span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-md border px-2 text-sm hover:bg-secondary sm:px-2.5"
            :class="paused ? 'border-amber-500/60 text-amber-800 dark:text-amber-200' : ''"
            :aria-label="status.full"
          >
            <span
              class="size-2 shrink-0 rounded-full"
              :class="day.checkedOut ? 'bg-muted-foreground/60' : paused ? 'bg-amber-500 motion-safe:animate-pulse' : 'bg-emerald-500'"
              aria-hidden="true"
            />
            <span class="whitespace-nowrap tabular-nums sm:hidden">{{ status.short }}</span>
            <span class="hidden whitespace-nowrap tabular-nums sm:inline">{{ status.full }}</span>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" class="w-64">
          <DropdownMenuLabel class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {{ t('shell.checkIn.today', { date: shortDate(day.date) }) }}
          </DropdownMenuLabel>
          <div class="space-y-1.5 px-2 pb-2 text-sm">
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-muted-foreground">{{ t('shell.checkIn.arrival') }}</span>
              <span class="tabular-nums font-medium">{{ arrival }}</span>
            </div>
            <p
              v-if="day.isWorkingDay && day.checkedIn"
              class="-mt-1 text-right text-xs"
              :class="isLate ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'"
            >
              {{ isLate ? t('shell.checkIn.late', { duration: formatMinutes(day.lateMinutes) }) : t('shell.checkIn.onTime', { start: day.start }) }}
            </p>
            <div v-if="totalPause > 0 || paused" class="flex items-baseline justify-between gap-3">
              <span class="text-muted-foreground">{{ t('shell.checkIn.pauses', { n: day.pauseCount }) }}</span>
              <span class="tabular-nums font-medium text-amber-700 dark:text-amber-300">
                −{{ formatMinutes(totalPause) === '—' ? t('shell.checkIn.zeroMinutes') : formatMinutes(totalPause) }}
              </span>
            </div>
            <p v-if="paused" class="-mt-1 text-right text-xs text-amber-700 dark:text-amber-300">
              {{ t('shell.checkIn.pausedSince', { time: pauseStart }) }}
            </p>
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-muted-foreground">{{ t('shell.checkIn.departure') }}</span>
              <span class="tabular-nums" :class="day.checkedOut ? 'font-medium' : 'text-muted-foreground'">
                {{ day.checkedOut ? departure : t('shell.checkIn.stillAtWork') }}
              </span>
            </div>
            <div class="flex items-baseline justify-between gap-3 border-t pt-1.5">
              <span class="text-muted-foreground">{{ t('shell.checkIn.worked') }}</span>
              <span class="tabular-nums font-semibold">{{ formatMinutes(worked) }}</span>
            </div>
            <p v-if="totalPause > 0" class="text-xs text-muted-foreground">
              {{ t('shell.checkIn.pauseDeducted') }}
            </p>
          </div>
          <p v-if="day.corrected" class="px-2 pb-2 text-xs text-muted-foreground">
            {{ t('shell.checkIn.correctedNote') }}
          </p>
          <DropdownMenuSeparator />
          <DropdownMenuItem @select="changePin()">
            <Icon name="lucide:key-round" class="size-4" />
            {{ lockState?.hasPin ? t('shell.lock.changePin') : t('shell.lock.setPin') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </template>

    <!-- Lock the screen: pauses a running shift; the PIN opens it again. -->
    <button
      type="button"
      class="grid size-9 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
      :disabled="busy"
      :aria-label="t('shell.lock.lockAria')"
      :title="onShift ? t('shell.lock.lockTitleOnShift') : t('shell.lock.lockTitle')"
      @click="lock()"
    >
      <Icon name="lucide:lock" class="size-4" />
    </button>

    <p
      v-if="error"
      role="alert"
      class="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border bg-popover px-3 py-2 text-xs text-destructive shadow-lg"
    >
      {{ error }}
    </p>
  </div>
</template>
