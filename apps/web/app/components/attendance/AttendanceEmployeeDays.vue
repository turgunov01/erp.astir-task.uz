<script setup lang="ts">
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'
import AttendanceCorrectDialog from '~/components/attendance/AttendanceCorrectDialog.vue'
import type {
  AttendanceDayFields,
  AttendancePerson,
  AttendanceSchedule,
  AttendanceStatus,
  AttendanceTotals
} from '~/utils/attendance'

/** One employee over the period, day by day, with corrections in place. */

const props = defineProps<{ employeeId: string, from: string, to: string }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const auth = useAuthStore()
const canManage = computed(() => auth.can(PERMISSION.ATTENDANCE_MANAGE))

interface DayRow extends AttendanceDayFields {
  date: string
  isWorkingDay: boolean
  status: AttendanceStatus
  correctedBy: { id: string, firstName: string, lastName: string } | null
}

interface EmployeeDays {
  employee: AttendancePerson
  today: string
  schedule: AttendanceSchedule
  days: DayRow[]
  totals: AttendanceTotals
}

const { data, pending, error, refresh } = useFetch<{ data: EmployeeDays }>(
  () => '/api/attendance/employees/' + props.employeeId + '/days',
  {
    query: computed(() => ({ from: props.from, to: props.to })),
    credentials: 'include'
  }
)

const detail = computed(() => data.value?.data ?? null)
const tz = computed(() => detail.value?.schedule.timezone ?? 'Asia/Tashkent')
/** Newest first: the recent days are the ones being checked. */
const days = computed(() => [...(detail.value?.days ?? [])].reverse())

const correcting = ref<DayRow | null>(null)

async function onCorrected() {
  correcting.value = null
  await refresh()
  emit('changed')
}

const isPast = (row: DayRow) => row.status !== 'UPCOMING'
</script>

<template>
  <div>
    <p v-if="pending && !detail" class="px-2 py-4 text-sm text-muted-foreground">Загружаю дни...</p>
    <p v-else-if="error" class="px-2 py-4 text-sm text-destructive">Не удалось загрузить дни сотрудника.</p>

    <table v-else-if="detail" class="w-full text-sm">
      <thead>
        <tr class="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <th class="px-2 py-1.5 font-medium">День</th>
          <th class="px-2 py-1.5 font-medium">Статус</th>
          <th class="px-2 py-1.5 text-right font-medium">Приход</th>
          <th class="px-2 py-1.5 text-right font-medium">Уход</th>
          <th class="px-2 py-1.5 text-right font-medium">Опоздание</th>
          <th class="px-2 py-1.5 text-right font-medium">Отработано</th>
          <th class="px-2 py-1.5 font-medium">Примечание</th>
          <th v-if="canManage" class="w-8" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in days"
          :key="row.date"
          class="border-t border-border/60"
          :class="row.isWorkingDay ? '' : 'text-muted-foreground'"
        >
          <td class="whitespace-nowrap px-2 py-1.5 tabular-nums">{{ shortDate(row.date) }}</td>
          <td class="px-2 py-1.5">
            <span class="inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium" :class="ATTENDANCE_STATUS_CLASS[row.status]">
              {{ attendanceStatusLabel(row.status, row.date === detail.today) }}
            </span>
          </td>
          <td class="px-2 py-1.5 text-right tabular-nums">{{ studioClock(row.checkInAt, tz) }}</td>
          <td class="px-2 py-1.5 text-right tabular-nums">{{ studioClock(row.checkOutAt, tz) }}</td>
          <td
            class="px-2 py-1.5 text-right tabular-nums"
            :class="row.lateMinutes > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : ''"
          >
            {{ row.lateMinutes > 0 ? '+' + formatMinutes(row.lateMinutes) : '—' }}
          </td>
          <td class="px-2 py-1.5 text-right tabular-nums">{{ formatMinutes(row.workedMinutes) }}</td>
          <td class="max-w-[14rem] px-2 py-1.5 text-xs text-muted-foreground">
            <span v-if="row.source && row.source !== 'WEB'" class="block truncate" :title="row.comment ?? ''">
              {{ ATTENDANCE_SOURCE_LABEL[row.source] }}<template v-if="row.correctedBy"> ({{ row.correctedBy.firstName }})</template><template v-if="row.comment">: {{ row.comment }}</template>
            </span>
          </td>
          <td v-if="canManage" class="px-1 py-1 text-right">
            <button
              v-if="isPast(row)"
              type="button"
              class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              :aria-label="'Исправить ' + shortDate(row.date)"
              title="Исправить приход и уход"
              @click="correcting = row"
            >
              <Icon name="lucide:pencil" class="size-3.5" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <AttendanceCorrectDialog
      v-if="correcting && detail"
      :person="detail.employee"
      :date="correcting.date"
      :day="correcting"
      :timezone="tz"
      @saved="onCorrected()"
      @cancel="correcting = null"
    />
  </div>
</template>
