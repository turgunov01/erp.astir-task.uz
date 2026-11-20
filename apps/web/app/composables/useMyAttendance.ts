import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'

/**
 * The signed-in employee's own shift: «Начать смену», «Пауза»,
 * «Продолжить смену», «Закончить смену».
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
  /** The shift is on «Пауза» right now. */
  paused: boolean
  pausedAt: string | null
  /** Minutes on pause today, the running pause included (as of the answer). */
  pausedMinutes: number
  /** Of pausedMinutes: the finished pauses only. */
  finishedPauseMinutes: number
  pauseCount: number
}

export type ShiftState = 'OPEN' | 'BEFORE' | 'AFTER' | 'DAY_OFF'

/** The screen lock and the working window, sent with every answer. */
export interface MyLockState {
  hasPin: boolean
  /** Locked by the lock icon or «Пауза»: only the PIN opens it. */
  locked: boolean
  /** Not closed outside the shift hours (owner, administrators). */
  windowExempt: boolean
  shift: {
    state: ShiftState
    start: string
    end: string
    endsAt: string | null
    opensAt: string | null
  }
}

type MyAttendanceAnswer = (MyAttendanceDay | { tracked: false }) & MyLockState

export function useMyAttendance() {
  const auth = useAuthStore()
  const answer = useState<MyAttendanceAnswer | null>('my-attendance', () => null)
  const busy = useState('my-attendance-busy', () => false)
  const error = useState('my-attendance-error', () => '')

  /** Staff accounts only; a client account never sees the button. */
  const enabled = computed(() => auth.can(PERMISSION.ATTENDANCE_SELF))
  const day = computed(() => (answer.value?.tracked ? answer.value : null))
  const lockState = computed<MyLockState | null>(() => answer.value ?? null)
  /** Asks for a new PIN; when set from the lock icon, locks right after. */
  const pinSetup = useState<{ open: boolean, lockAfter: boolean }>('my-pin-setup', () => ({ open: false, lockAfter: false }))

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

  async function mark(path: 'check-in' | 'check-out' | 'lock', fallback: string) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      const response = await apiRequest<{ data: MyAttendanceAnswer }>('/api/attendance/me/' + path, { method: 'POST' })
      answer.value = response.data
    } catch (err) {
      error.value = apiErrorMessage(err, fallback)
      await load()
    } finally {
      busy.value = false
    }
  }

  /**
   * Lock icon and «Пауза»: lock the screen (a running shift pauses with it).
   * Without a PIN yet, ask for one first and lock once it is set.
   */
  function lock() {
    if (!lockState.value?.hasPin) {
      pinSetup.value = { open: true, lockAfter: true }
      return
    }
    return mark('lock', translate('shell.lock.lockFailed'))
  }

  /** Open the screen with the PIN or, if forgotten, the password. Returns the error, if any. */
  async function unlock(secret: { pin?: string, password?: string }): Promise<string> {
    try {
      const response = await apiRequest<{ data: MyAttendanceAnswer }>('/api/attendance/me/unlock', { method: 'POST', body: secret })
      answer.value = response.data
      return ''
    } catch (err) {
      return apiErrorMessage(err, translate('shell.lock.unlockFailed'))
    }
  }

  /** Set or replace the PIN. Returns the error, if any. */
  async function setPin(pin: string, password?: string): Promise<string> {
    try {
      const response = await apiRequest<{ data: MyAttendanceAnswer }>('/api/attendance/me/pin', { method: 'PUT', body: { pin, password } })
      answer.value = response.data
      return ''
    } catch (err) {
      return apiErrorMessage(err, translate('shell.lock.pinSaveFailed'))
    }
  }

  return {
    day,
    lockState,
    pinSetup,
    enabled,
    busy,
    error,
    load,
    lock,
    unlock,
    setPin,
    checkIn: () => mark('check-in', translate('shell.checkIn.checkInFailed')),
    checkOut: () => mark('check-out', translate('shell.checkIn.checkOutFailed')),
    /** «Пауза» is the screen lock: the PIN resumes the shift. */
    pause: lock
  }
}
