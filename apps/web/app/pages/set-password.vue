<script setup lang="ts">
import { PASSWORD_MIN_LENGTH } from '@astir/validation'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { apiErrorMessage } from '~/composables/useApi'
import { passwordStrength, type PasswordStrength } from '~/utils/password-strength'

/*
 * The stop after signing in with a password a manager set.
 *
 * The route middleware keeps such a session here, and the API refuses it
 * everything else, so the person reaches the studio only with a password
 * nobody else knows. The current password is not asked again: it was typed a
 * moment ago to get here. The field words are the reset page's own.
 */
definePageMeta({ layout: false })

const { t } = useI18n()
useHead({ title: computed(() => t('auth.setPassword.pageTitle')) })

const auth = useAuthStore()
const brand = useBrand()

const password = ref('')
const confirm = ref('')
const reveal = ref(false)
const pending = ref(false)
const errorMessage = ref('')

const strength = computed<PasswordStrength>(() => passwordStrength(password.value, PASSWORD_MIN_LENGTH))
const STRENGTH_BAR: Record<PasswordStrength, string> = {
  weak: 'bg-destructive',
  fair: 'bg-amber-500',
  good: 'bg-emerald-500',
  strong: 'bg-emerald-600'
}
const STRENGTH_SEGMENTS: Record<PasswordStrength, number> = { weak: 1, fair: 2, good: 3, strong: 4 }

const problem = computed(() => {
  if (password.value.length < PASSWORD_MIN_LENGTH) return t('auth.reset.tooShort', { min: PASSWORD_MIN_LENGTH })
  if (password.value !== confirm.value) return t('auth.reset.mismatch')
  return ''
})

async function onSubmit() {
  if (pending.value) return
  if (problem.value) {
    errorMessage.value = problem.value
    return
  }
  pending.value = true
  errorMessage.value = ''
  try {
    await auth.setPassword(password.value)
    password.value = ''
    confirm.value = ''
    await navigateTo(auth.homePath)
  } catch (err: unknown) {
    errorMessage.value = apiErrorMessage(err, t('auth.setPassword.failed'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="grid min-h-svh place-items-center px-6 py-12">
    <div class="w-full max-w-sm">
      <p class="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {{ brand.name }}
      </p>
      <h1 class="mt-2 text-2xl font-semibold tracking-tight">{{ t('auth.setPassword.title') }}</h1>
      <p class="mt-2 text-sm text-muted-foreground">{{ t('auth.setPassword.intro') }}</p>

      <p
        v-if="auth.user"
        class="mt-6 rounded-md border bg-secondary px-3 py-2.5 text-sm text-secondary-foreground"
      >
        {{ t('auth.setPassword.signedInAs') }}
        <span class="font-medium">{{ auth.user.email }}</span>
      </p>

      <form class="mt-6 space-y-4" novalidate @submit.prevent="onSubmit">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label for="password">{{ t('auth.reset.password') }}</Label>
            <button
              type="button"
              class="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              :aria-pressed="reveal"
              @click="reveal = !reveal"
            >
              {{ reveal ? t('auth.reset.hide') : t('auth.reset.show') }}
            </button>
          </div>
          <Input
            id="password"
            v-model="password"
            :type="reveal ? 'text' : 'password'"
            autocomplete="new-password"
            aria-describedby="password-hint"
            autofocus
            required
          />
          <div v-if="password" class="space-y-1" aria-live="polite">
            <div class="flex gap-1" aria-hidden="true">
              <span
                v-for="segment in 4"
                :key="segment"
                class="h-1 flex-1 rounded-full transition-colors"
                :class="segment <= STRENGTH_SEGMENTS[strength] ? STRENGTH_BAR[strength] : 'bg-muted'"
              />
            </div>
            <p class="text-xs text-muted-foreground">
              {{ t('auth.reset.strength.label', { level: t('auth.reset.strength.' + strength) }) }}
            </p>
          </div>
          <p id="password-hint" class="text-xs text-muted-foreground">
            {{ t('auth.reset.hint', { min: PASSWORD_MIN_LENGTH }) }}
          </p>
        </div>

        <div class="space-y-2">
          <Label for="confirm">{{ t('auth.reset.confirm') }}</Label>
          <Input
            id="confirm"
            v-model="confirm"
            :type="reveal ? 'text' : 'password'"
            autocomplete="new-password"
            required
          />
        </div>

        <p
          v-if="errorMessage"
          role="alert"
          class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {{ errorMessage }}
        </p>

        <Button type="submit" class="w-full" :disabled="pending">
          {{ pending ? t('auth.reset.submitting') : t('auth.setPassword.submit') }}
        </Button>
      </form>

      <button
        type="button"
        class="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        @click="auth.logout()"
      >
        <Icon name="lucide:log-out" class="size-3.5" />
        {{ t('auth.setPassword.logout') }}
      </button>
    </div>
  </main>
</template>
