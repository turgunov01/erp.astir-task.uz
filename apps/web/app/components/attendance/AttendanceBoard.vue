<script setup lang="ts">
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'
import AttendancePersonCell from '~/components/attendance/AttendancePerson.vue'
import AttendanceCorrectDialog from '~/components/attendance/AttendanceCorrectDialog.vue'
import type {
  AttendanceDayFields,
  AttendancePerson,
  AttendanceSchedule,
  AttendanceStatus
} from '~/utils/attendance'

/**
 * One day, everyone on staff: who came to work and who did not, front and
 * centre. The list is grouped — not arrived first, then seen-but-not-marked,
 * then arrived (the late ones on top), then everyone not due today — so the
 * owner reads the answer off the top. Today's board refreshes every minute.
 */

const props = defineProps<{ date: string | null }>()
const { t } = useI18n()
const emit = defineEmits<{ (e: 'update:date', value: string): void }>()

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.ATTENDANCE_MANAGE))
const canSeeFeed = computed(() => auth.can(PERMISSION.ACTIVITY_VIEW))

interface BoardRow extends AttendanceDayFields {
  employee: AttendancePerson
  status: AttendanceStatus
  /** Using the app in the last few minutes (today only). */
  online: boolean
  actions: number
}

interface Board {
  date: string
  today: string
  isToday: boolean
  isWorkingDay: boolean
  schedule: AttendanceSchedule
  rows: BoardRow[]
}

const query = computed(() => (props.date ? { date: props.date } : {}))
const { data, pending, error, refresh } = await useFetch<{ data: Board }>('/api/attendance/board', {
  query,
  credentials: 'include',
  watch: [query]
})

const board = computed(() => data.value?.data ?? null)
const rows = computed(() => board.value?.rows ?? [])
const tz = computed(() => board.value?.schedule.timezone ?? 'Asia/Tashkent')
const isToday = computed(() => board.value?.isToday ?? false)

const errorMessage = computed(() => {
  if (!error.value) return ''
  const body = error.value.data as { error?: { message?: string } } | undefined
  return body?.error?.message ?? t('team.board.loadFailed')
})

/* ---------------------------------------------------------------- filters */

type StatusFilter = '' | 'ARRIVED' | 'PRESENT' | 'UNMARKED' | 'LATE' | 'ABSENT' | 'ONLINE' | 'DAY_OFF' | 'ON_LEAVE'

const department = ref('')
const status = ref<StatusFilter>('')

const departments = computed(() => {
  const names = new Set<string>()
  for (const row of rows.value) if (row.employee.department) names.add(row.employee.department.name)
  return [...names].sort((a, b) => a.localeCompare(b, intlTag()))
})

/** At work today, whether by the button or only seen in the app. */
const hasArrived = (row: BoardRow) => row.status === 'PRESENT' || row.status === 'UNMARKED'

function matchesStatus(row: BoardRow, wanted: StatusFilter) {
  switch (wanted) {
    case '': return true
    case 'ARRIVED': return hasArrived(row)
    case 'LATE': return row.lateMinutes > 0
    case 'ONLINE': return row.online
    default: return row.status === wanted
  }
}

const inDepartment = computed(() =>
  rows.value.filter(row => !department.value || row.employee.department?.name === department.value)
)
const visible = computed(() => inDepartment.value.filter(row => matchesStatus(row, status.value)))

/** Tiles count within the chosen department, and double as filters. */
const tiles = computed(() => {
  const list = inDepartment.value
  return [
    { key: 'ARRIVED' as const, primary: true, label: t('team.board.tiles.arrived'), value: list.filter(hasArrived).length, tone: 'text-emerald-700 dark:text-emerald-300' },
    { key: 'ABSENT' as const, primary: true, label: t('team.board.tiles.absent'), value: list.filter(row => row.status === 'ABSENT').length, tone: 'text-destructive' },
    { key: 'LATE' as const, label: t('team.board.tiles.late'), value: list.filter(row => row.lateMinutes > 0).length, tone: 'text-amber-700 dark:text-amber-300' },
    { key: 'UNMARKED' as const, label: t('team.board.tiles.unmarked'), value: list.filter(row => row.status === 'UNMARKED').length, tone: 'text-amber-700 dark:text-amber-300' },
    { key: 'ONLINE' as const, label: t('team.board.tiles.online'), value: list.filter(row => row.online).length, tone: 'text-sky-700 dark:text-sky-300' }
  ]
})

/* ---------------------------------------------------------------- groups */

interface BoardGroup {
  key: string
  label: string
  tone: string
  rows: BoardRow[]
}

const GROUPS: ReadonlyArray<Omit<BoardGroup, 'rows' | 'label'> & { labelKey: string, has: (row: BoardRow) => boolean }> = [
  { key: 'absent', labelKey: 'team.board.groups.absent', tone: 'text-destructive', has: row => row.status === 'ABSENT' },
  { key: 'unmarked', labelKey: 'team.board.groups.unmarked', tone: 'text-amber-700 dark:text-amber-300', has: row => row.status === 'UNMARKED' },
  { key: 'present', labelKey: 'team.board.groups.present', tone: 'text-emerald-700 dark:text-emerald-300', has: row => row.status === 'PRESENT' },
  { key: 'off', labelKey: 'team.board.groups.off', tone: 'text-muted-foreground', has: () => true }
]

/** Late first (the latest on top), then by arrival; names break ties. */
function byLateness(a: BoardRow, b: BoardRow) {
  return b.lateMinutes - a.lateMinutes ||
    (a.checkInAt ?? '').localeCompare(b.checkInAt ?? '') ||
    a.employee.user.lastName.localeCompare(b.employee.user.lastName, intlTag())
}

const groups = computed<BoardGroup[]>(() => {
  let rest = visible.value
  const out: BoardGroup[] = []
  for (const group of GROUPS) {
    const rows = rest.filter(group.has)
    rest = rest.filter(row => !group.has(row))
    if (rows.length > 0) out.push({ key: group.key, label: t(group.labelKey), tone: group.tone, rows: [...rows].sort(byLateness) })
  }
  return out
})

function toggleTile(key: StatusFilter) {
  status.value = status.value === key ? '' : key
}

/* ------------------------------------------------------------------- date */

function move(days: number) {
  if (!board.value) return
  const next = shiftDate(board.value.date, days)
  if (next <= board.value.today) emit('update:date', next)
}

function pickDate(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (value) emit('update:date', value)
}

/* --------------------------------------------------------- auto refresh */

const REFRESH_MS = 60_000
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    if (isToday.value && document.visibilityState === 'visible') refresh()
  }, REFRESH_MS)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

/* ------------------------------------------------------------ correction */

const correcting = ref<BoardRow | null>(null)

async function onCorrected() {
  correcting.value = null
  await refresh()
}

function feedLink(row: BoardRow) {
  return { path: '/activity', query: { actorId: row.employee.user.id, from: board.value?.date, to: board.value?.date } }
}
</script>

<template>
  <div>
    <div class="mb-5 flex flex-wrap items-center gap-2">
      <div class="flex items-center rounded-md border bg-background">
        <button
          type="button"
          class="grid size-9 place-items-center text-muted-foreground hover:text-foreground"
          :aria-label="t('team.board.previousDay')"
          @click="move(-1)"
        >
          <Icon name="lucide:chevron-left" class="size-4" />
        </button>
        <input
          :value="board?.date ?? props.date ?? ''"
          :max="board?.today"
          type="date"
          class="h-9 border-x bg-transparent px-2 text-sm tabular-nums outline-none"
          :aria-label="t('team.board.day')"
          @change="pickDate"
        >
        <button
          type="button"
          class="grid size-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
          :aria-label="t('team.board.nextDay')"
          :disabled="!board || board.date >= board.today"
          @click="move(1)"
        >
          <Icon name="lucide:chevron-right" class="size-4" />
        </button>
      </div>
      <button
        v-if="board && !board.isToday"
        type="button"
        class="h-9 rounded-md border px-3 text-sm hover:bg-secondary"
        @click="emit('update:date', board.today)"
      >
        {{ t('team.board.today') }}
      </button>

      <select
        v-model="department"
        class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
        :aria-label="t('team.departmentFilter')"
      >
        <option value="">{{ t('team.allDepartments') }}</option>
        <option v-for="name in departments" :key="name" :value="name">{{ name }}</option>
      </select>
      <select
        v-model="status"
        class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
        :aria-label="t('team.board.statusFilter')"
      >
        <option value="">{{ t('team.board.filter.any') }}</option>
        <option value="ARRIVED">{{ t('team.board.filter.ARRIVED') }}</option>
        <option value="PRESENT">{{ t('team.board.filter.PRESENT') }}</option>
        <option value="UNMARKED">{{ t('team.board.filter.UNMARKED') }}</option>
        <option value="ABSENT">{{ t('team.board.filter.ABSENT') }}</option>
        <option value="LATE">{{ t('team.board.filter.LATE') }}</option>
        <option value="ONLINE">{{ t('team.board.filter.ONLINE') }}</option>
        <option value="DAY_OFF">{{ t('team.board.filter.DAY_OFF') }}</option>
        <option value="ON_LEAVE">{{ t('team.board.filter.ON_LEAVE') }}</option>
      </select>

      <span v-if="board && !board.isWorkingDay" class="rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">
        {{ t('team.board.dayOff') }}
      </span>
      <span v-if="isToday" class="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <span class="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
        {{ t('team.board.autoRefresh') }}
      </span>
    </div>

    <div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <button
        v-for="tile in tiles"
        :key="tile.key"
        type="button"
        class="rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-ring/60"
        :class="status === tile.key ? 'border-ring ring-1 ring-ring/40' : ''"
        :aria-pressed="status === tile.key"
        @click="toggleTile(tile.key)"
      >
        <span class="block text-xs font-medium uppercase tracking-wider text-muted-foreground">{{ tile.label }}</span>
        <span class="mt-1 block font-semibold tabular-nums" :class="[tile.value > 0 ? tile.tone : '', tile.primary ? 'text-3xl' : 'text-2xl']">
          {{ tile.value }}
        </span>
      </button>
    </div>

    <div v-if="pending && !board" class="space-y-2">
      <div v-for="n in 5" :key="n" class="h-16 rounded-xl bg-muted" />
    </div>

    <div v-else-if="errorMessage" class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center">
      <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
      <p class="mt-3 text-sm">{{ errorMessage }}</p>
      <button type="button" class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="refresh()">
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <p v-else-if="visible.length === 0" class="rounded-xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
      {{ rows.length === 0 ? t('team.board.noStaff') : t('team.noMatches') }}
    </p>

    <div v-else class="overflow-hidden rounded-xl border bg-card">
      <div class="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_repeat(5,minmax(0,0.9fr))_6.5rem] gap-3 border-b px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:grid">
        <span>{{ t('team.board.columns.employee') }}</span>
        <span>{{ t('team.board.columns.status') }}</span>
        <span>{{ t('team.board.columns.arrived') }}</span>
        <span>{{ t('team.board.columns.late') }}</span>
        <span>{{ t('team.board.columns.activity') }}</span>
        <span>{{ t('team.board.columns.worked') }}</span>
        <span>{{ t('team.board.columns.actions') }}</span>
        <span />
      </div>

      <ul>
        <template v-for="group in groups" :key="group.key">
        <li class="flex items-center gap-2 border-b bg-muted/40 px-4 py-1.5 text-xs font-medium uppercase tracking-wider" :class="group.tone">
          {{ group.label }}
          <span class="rounded-full bg-background px-1.5 tabular-nums text-muted-foreground">{{ group.rows.length }}</span>
        </li>
        <li
          v-for="row in group.rows"
          :key="row.employee.id"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-0 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_repeat(5,minmax(0,0.9fr))_6.5rem]"
        >
          <AttendancePersonCell :person="row.employee" :online="row.online" />

          <span class="max-w-[9.5rem] justify-self-end text-right lg:max-w-none lg:justify-self-start lg:text-left">
            <span
              class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
              :class="ATTENDANCE_STATUS_CLASS[row.status]"
            >
              {{ attendanceStatusLabel(row.status, isToday) }}
            </span>
            <span v-if="row.online" class="ml-1.5 hidden items-center gap-1 text-xs text-emerald-700 lg:inline-flex dark:text-emerald-300">
              <span class="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden="true" />
              {{ t('team.board.online') }}
            </span>
            <Icon
              v-if="row.source === 'MANUAL'"
              name="lucide:pencil"
              class="ml-1 inline size-3 text-muted-foreground"
              :title="t('team.board.correctedTitle', { comment: row.comment ?? '' })"
            />
          </span>

          <dl class="col-span-2 grid grid-cols-3 gap-2 text-sm sm:grid-cols-5 lg:contents">
            <div>
              <dt class="text-[11px] text-muted-foreground lg:hidden">{{ t('team.board.columns.arrived') }}</dt>
              <dd v-if="row.status === 'UNMARKED'" class="text-muted-foreground" :title="t('team.board.unmarkedTitle')">
                <span class="tabular-nums">{{ studioClock(row.checkInAt, tz) }}</span>
                <span class="block text-[11px] leading-tight">{{ t('team.board.unmarkedNote') }}</span>
              </dd>
              <dd v-else class="tabular-nums">
                <span class="inline-flex items-center gap-1" :class="row.checkInMethod === 'BUTTON' && row.source === 'WEB' ? 'font-medium' : ''">
                  <Icon
                    v-if="row.checkInMethod === 'BUTTON' && row.source === 'WEB'"
                    name="lucide:map-pin-check"
                    class="size-3.5 text-emerald-600 dark:text-emerald-400"
                    :aria-label="t('team.board.byButton')"
                  />
                  {{ studioClock(row.checkInAt, tz) }}
                </span>
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted-foreground lg:hidden">{{ t('team.board.columns.late') }}</dt>
              <dd class="tabular-nums" :class="row.lateMinutes > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'">
                {{ row.lateMinutes > 0 ? '+' + formatMinutes(row.lateMinutes) : '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted-foreground lg:hidden">{{ t('team.board.columns.activity') }}</dt>
              <dd class="tabular-nums">{{ studioClock(row.lastSeenAt, tz) }}</dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted-foreground lg:hidden">{{ t('team.board.columns.worked') }}</dt>
              <dd class="tabular-nums">{{ formatMinutes(row.workedMinutes) }}</dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted-foreground lg:hidden">{{ t('team.board.columns.actions') }}</dt>
              <dd class="tabular-nums">
                <NuxtLink
                  v-if="canSeeFeed && row.actions > 0"
                  :to="feedLink(row)"
                  class="underline-offset-2 hover:underline"
                  :title="t('team.board.feedOf', { name: row.employee.user.firstName })"
                >
                  {{ row.actions }}
                </NuxtLink>
                <span v-else :class="row.actions === 0 ? 'text-muted-foreground' : ''">{{ row.actions }}</span>
              </dd>
            </div>
          </dl>

          <div class="col-span-2 flex items-center justify-end gap-1 lg:col-span-1">
            <NuxtLink
              v-if="canSeeFeed"
              :to="feedLink(row)"
              class="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              :aria-label="t('team.board.feedAria', { name: row.employee.user.firstName + ' ' + row.employee.user.lastName })"
              :title="t('team.board.feed')"
            >
              <Icon name="lucide:activity" class="size-4" />
            </NuxtLink>
            <button
              v-if="canManage"
              type="button"
              class="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              :aria-label="t('team.board.correctAria', { name: row.employee.user.firstName + ' ' + row.employee.user.lastName })"
              :title="t('team.attendance.correctTitle')"
              @click="correcting = row"
            >
              <Icon name="lucide:pencil" class="size-4" />
            </button>
          </div>
        </li>
        </template>
      </ul>
    </div>

    <AttendanceCorrectDialog
      v-if="correcting && board"
      :person="correcting.employee"
      :date="board.date"
      :day="correcting"
      :timezone="tz"
      @saved="onCorrected()"
      @cancel="correcting = null"
    />
  </div>
</template>
