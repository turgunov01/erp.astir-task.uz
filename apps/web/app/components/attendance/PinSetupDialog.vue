<script setup lang="ts">
import { useMyAttendance } from '~/composables/useMyAttendance'

/**
 * Set or change the screen-lock PIN.
 *
 * Opened from the lock icon when no PIN exists yet (then the screen locks
 * as soon as it is saved), or from «Сменить PIN-код» in the shift menu.
 * Replacing an existing PIN asks for the account password, so somebody at
 * an unlocked desk cannot quietly change it.
 */

const { t } = useI18n()
const { lockState, pinSetup, setPin, lock } = useMyAttendance()

const PIN_PATTERN = /^\d{4,6}$/
const PIN_LENGTH_MAX = 6

const pin = ref('')
const confirm = ref('')
const password = ref('')
const saving = ref(false)
const formError = ref('')

const replacing = computed(() => Boolean(lockState.value?.hasPin))

watch(() => pinSetup.value.open, open => {
  if (!open) return
  pin.value = ''
  confirm.value = ''
  password.value = ''
  formError.value = ''
})

const digitsOf = (event: Event) =>
  (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, PIN_LENGTH_MAX)

function close() {
  pinSetup.value = { open: false, lockAfter: false }
}

async function save() {
  if (!PIN_PATTERN.test(pin.value)) {
    formError.value = t('shell.lock.pinShort')
    return
  }
  if (pin.value !== confirm.value) {
    formError.value = t('shell.lock.pinMismatch')
    return
  }
  if (replacing.value && !password.value) {
    formError.value = t('shell.lock.passwordEmpty')
    return
  }
  saving.value = true
  formError.value = await setPin(pin.value, replacing.value ? password.value : undefined)
  saving.value = false
  if (formError.value) return
  const lockAfter = pinSetup.value.lockAfter
  close()
  if (lockAfter) await lock()
}

const INPUT = 'h-10 w-full rounded-md border bg-background px-3 text-sm tracking-[0.4em] tabular-nums outline-none focus:border-ring'
</script>

<template>
  <Teleport to="body">
    <div
      v-if="pinSetup.open"
      class="fixed inset-0 z-[90] grid place-items-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-setup-title"
      @keydown.esc="close()"
    >
      <div class="drawer-scrim absolute inset-0 bg-black/50" @click="close()" />
      <form class="dialog-panel relative w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl" @submit.prevent="save()">
        <div class="flex items-start gap-3">
          <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon name="lucide:key-round" class="size-5" />
          </div>
          <div>
            <h2 id="pin-setup-title" class="text-base font-semibold tracking-tight">
              {{ replacing ? t('shell.lock.changePin') : t('shell.lock.setPin') }}
            </h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ pinSetup.lockAfter ? t('shell.lock.setPinFirst') : t('shell.lock.setPinBody') }}
            </p>
          </div>
        </div>

        <div class="mt-5 space-y-3">
          <label class="block text-sm">
            <span class="mb-1.5 block text-xs text-muted-foreground">{{ t('shell.lock.newPin') }}</span>
            <input
              :value="pin"
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              :maxlength="PIN_LENGTH_MAX"
              :class="INPUT"
              autofocus
              @input="pin = digitsOf($event)"
            >
          </label>
          <label class="block text-sm">
            <span class="mb-1.5 block text-xs text-muted-foreground">{{ t('shell.lock.confirmPin') }}</span>
            <input
              :value="confirm"
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              :maxlength="PIN_LENGTH_MAX"
              :class="INPUT"
              @input="confirm = digitsOf($event)"
            >
          </label>
          <label v-if="replacing" class="block text-sm">
            <span class="mb-1.5 block text-xs text-muted-foreground">{{ t('shell.lock.passwordLabel') }}</span>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
            >
          </label>
        </div>

        <p v-if="formError" role="alert" class="mt-3 text-sm text-destructive">{{ formError }}</p>

        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" @click="close()">
            {{ t('common.actions.cancel') }}
          </button>
          <button
            type="submit"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            :disabled="saving"
          >
            <Icon v-if="pinSetup.lockAfter" name="lucide:lock" class="size-4" />
            {{ pinSetup.lockAfter ? t('shell.lock.saveAndLock') : t('common.actions.save') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
