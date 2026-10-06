import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'

/**
 * The signed-in employee's own day: «Я приехал» / «Я ушёл».
 *
 * Shared through useState so the header button and the morning prompt show
 * one state and a press in either updates both. Times come from the server;
 * the browser only asks it to mark "now".
 */

export interface MyAttendanceDay {
  tracked: true
  date: string
  timezone: string
  isWorkingDay: boolean
  start: string
  graceMinutes: number
  checkInAt: string | null
  checkOutAt: string | null
  lateMinutes: number
  workedMinutes: number
  checkedIn: boolean
  checkedOut: boolean
  corrected: boolean
  firstSeenAt: string | null
}

type MyAttendanceAnswer = MyAttendanceDay | { tracked: false }

export function useMyAttendance() {
  const auth = useAuthStore()
  const answer = useState<MyAttendanceAnswer | null>('my-attendance', () => null)
  const busy = useState('my-attendance-busy', () => false)
  const error = useState('my-attendance-error', () => '')

  /** Staff accounts only; a client account never sees the button. */
  const enabled = computed(() => auth.can(PERMISSION.ATTENDANCE_SELF))
  const day = computed(() => (answer.value?.tracked ? answer.value : null))

  async function load() {
    if (!enabled.value) {
      answer.value = null
      return
    }
    try {
      const response = await apiRequest<{ data: MyAttendanceAnswer }>('/api/attendance/me/today')
      answer.value = response.data
    } catch {
      // The button simply stays hidden until the next successful load.
      answer.value = null
    }
  }

  async function mark(path: 'check-in' | 'check-out', fallback: string) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      const response = await apiRequest<{ data: MyAttendanceDay }>('/api/attendance/me/' + path, { method: 'POST' })
      answer.value = response.data
    } catch (err) {
      error.value = apiErrorMessage(err, fallback)
      await load()
    } finally {
      busy.value = false
    }
  }

  return {
    day,
    enabled,
    busy,
    error,
    load,
    checkIn: () => mark('check-in', 'Не удалось отметить приход'),
    checkOut: () => mark('check-out', 'Не удалось отметить уход')
  }
}
