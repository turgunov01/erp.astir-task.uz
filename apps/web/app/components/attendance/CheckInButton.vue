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
 * «Я приехал» next to the notification bell.
 *
 * Before the press it is the one coloured control in the header; after it
 * turns into a quiet status («На работе с 09:05») whose menu shows the
 * arrival, any lateness, and «Я ушёл».
 */

const auth = useAuthStore()
const { day, enabled, busy, error, load, checkIn, checkOut } = useMyAttendance()

const tz = computed(() => day.value?.timezone ?? 'Asia/Tashkent')
const arrival = computed(() => studioClock(day.value?.checkInAt, tz.value))
const departure = computed(() => studioClock(day.value?.checkOutAt, tz.value))
const needsPress = computed(() => Boolean(day.value && !day.value.checkedIn && !day.value.corrected))
const isLate = computed(() => (day.value?.lateMinutes ?? 0) > 0)

/** The trigger's words, full on a desktop and short on a phone. */
const status = computed(() => {
  const current = day.value
  if (!current?.checkedIn) return { full: 'День исправлен', short: 'Исправлен' }
  if (current.checkedOut) return { full: 'Ушёл в ' + departure.value, short: 'Ушёл ' + departure.value }
  return { full: 'На работе с ' + arrival.value, short: 'с ' + arrival.value }
})

/* A page left open overnight must not keep showing yesterday's marks. */
function onVisible() {
  if (document.visibilityState === 'visible') load()
}
onMounted(() => {
  load()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
watch(() => auth.user?.id, () => load())

/* The error bubble goes away on its own; the state was reloaded already. */
const ERROR_MS = 6000
let errorTimer: ReturnType<typeof setTimeout> | null = null
watch(error, (message) => {
  if (errorTimer) clearTimeout(errorTimer)
  if (message) errorTimer = setTimeout(() => { error.value = '' }, ERROR_MS)
})
</script>

<template>
  <div v-if="enabled && day" class="relative">
    <button
      v-if="needsPress"
      type="button"
      class="group relative flex h-9 items-center gap-1.5 rounded-md bg-signal px-2.5 text-sm font-semibold text-signal-foreground shadow-sm transition-[transform,filter] hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70 sm:px-3"
      :disabled="busy"
      aria-label="Я приехал — отметить приход на работу"
      title="Отметить приход на работу"
      @click="checkIn()"
    >
      <span class="absolute -right-1 -top-1 flex size-2.5" aria-hidden="true">
        <span class="absolute inline-flex size-full rounded-full bg-signal opacity-75 motion-safe:animate-ping" />
        <span class="relative inline-flex size-2.5 rounded-full border-2 border-card bg-signal" />
      </span>
      <Icon :name="busy ? 'lucide:loader-circle' : 'lucide:map-pin-check'" class="size-4" :class="busy ? 'motion-safe:animate-spin' : ''" />
      <span class="whitespace-nowrap">Я приехал</span>
    </button>

    <DropdownMenu v-else>
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-md border px-2 text-sm hover:bg-secondary sm:px-2.5"
          :aria-label="status.full"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :class="day.checkedOut ? 'bg-muted-foreground/60' : 'bg-emerald-500'"
            aria-hidden="true"
          />
          <span class="whitespace-nowrap tabular-nums sm:hidden">{{ status.short }}</span>
          <span class="hidden whitespace-nowrap tabular-nums sm:inline">{{ status.full }}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" class="w-60">
        <DropdownMenuLabel class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Сегодня, {{ shortDate(day.date) }}
        </DropdownMenuLabel>
        <div class="space-y-1.5 px-2 pb-2 text-sm">
          <div class="flex items-baseline justify-between gap-3">
            <span class="text-muted-foreground">Приход</span>
            <span class="tabular-nums font-medium">{{ arrival }}</span>
          </div>
          <p
            v-if="day.isWorkingDay && day.checkedIn"
            class="-mt-1 text-right text-xs"
            :class="isLate ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'"
          >
            {{ isLate ? 'опоздание ' + formatMinutes(day.lateMinutes) : 'вовремя, начало в ' + day.start }}
          </p>
          <div class="flex items-baseline justify-between gap-3">
            <span class="text-muted-foreground">Уход</span>
            <span class="tabular-nums" :class="day.checkedOut ? 'font-medium' : 'text-muted-foreground'">
              {{ day.checkedOut ? departure : 'ещё на работе' }}
            </span>
          </div>
        </div>
        <p v-if="day.corrected" class="px-2 pb-2 text-xs text-muted-foreground">
          День исправлен администратором — отметки по кнопкам не нужны.
        </p>
        <template v-if="!day.checkedOut && !day.corrected">
          <DropdownMenuSeparator />
          <DropdownMenuItem :disabled="busy" @select="checkOut()">
            <Icon name="lucide:log-out" class="size-4" />
            Я ушёл
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>

    <p
      v-if="error"
      role="alert"
      class="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border bg-popover px-3 py-2 text-xs text-destructive shadow-lg"
    >
      {{ error }}
    </p>
  </div>
</template>
