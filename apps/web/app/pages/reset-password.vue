<script setup lang="ts">
import { PASSWORD_MIN_LENGTH } from '@astir/validation'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { passwordStrength, type PasswordStrength } from '~/utils/password-strength'

definePageMeta({ layout: false })

const { t } = useI18n()
/*
 * The token sits in this page's address. No referrer, so it is never handed
 * to the API (or anything else) in a Referer header that a proxy might log.
 */
useHead({
  title: computed(() => t('auth.reset.pageTitle')),
  meta: [{ name: 'referrer', content: 'no-referrer' }]
})

const route = useRoute()
const auth = useAuthStore()
const brand = useBrand()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token.trim() : ''))

/** checking → form → done, or invalid at any point the API says so. */
type Step = 'checking' | 'form' | 'done' | 'invalid'
const step = ref<Step>('checking')
const invalidReason = ref('')

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

/** What is wrong with the form right now, if anything; checked again on the server. */
const problem = computed(() => {
  if (password.value.length < PASSWORD_MIN_LENGTH) return t('auth.reset.tooShort', { min: PASSWORD_MIN_LENGTH })
  if (password.value !== confirm.value) return t('auth.reset.mismatch')
  return ''
})

/** An answer from the API that means the link itself is the problem. */
function isLinkError(err: unknown): boolean {
  const status = (err as { status?: number, statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode
  return status === 400
}

function markInvalid(message: string) {
  invalidReason.value = message
  step.value = 'invalid'
}

async function checkLink() {
  if (!token.value) return markInvalid(t('auth.reset.missingToken'))
  try {
    await apiRequest('/api/auth/reset-password/check', { method: 'POST', body: { token: token.value } })
    step.value = 'form'
  } catch (err: unknown) {
    if (isLinkError(err)) return markInvalid(apiErrorMessage(err, t('auth.reset.invalid')))
    // The check is a courtesy: if it could not run, let the submit decide.
    step.value = 'form'
    errorMessage.value = apiErrorMessage(err, t('auth.reset.failed'))
  }
}

async function onSubmit() {
  if (pending.value) return
  if (problem.value) {
    errorMessage.value = problem.value
    return
  }
  pending.value = true
  errorMessage.value = ''
  try {
    await apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, password: password.value }
    })
    password.value = ''
    confirm.value = ''
    // The API has ended every session; forget any this tab still believes in.
    if (auth.isAuthenticated) await auth.logout().catch(() => undefined)
    step.value = 'done'
  } catch (err: unknown) {
    const body = (err as { data?: { error?: { details?: unknown } } })?.data?.error
    // A field problem (password policy) stays on the form; anything else at 400 is the link.
    if (isLinkError(err) && !body?.details) return markInvalid(apiErrorMessage(err, t('auth.reset.invalid')))
    errorMessage.value = apiErrorMessage(err, t('auth.reset.failed'))
  } finally {
    pending.value = false
  }
}

onMounted(checkLink)
</script>

<template>
  <main class="grid min-h-svh place-items-center px-6 py-12">
    <div class="w-full max-w-sm">
      <NuxtLink
        to="/login"
        class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Icon name="lucide:arrow-left" class="size-3.5" />
        {{ t('auth.forgot.backToLogin') }}
      </NuxtLink>

      <p class="mt-8 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {{ brand.name }}
      </p>

      <!-- Checking the link before anyone types a password that cannot be used. -->
      <template v-if="step === 'checking'">
        <h1 class="mt-2 text-2xl font-semibold tracking-tight">{{ t('auth.reset.title') }}</h1>
        <p role="status" class="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="lucide:loader-circle" class="size-4 animate-spin" />
          {{ t('auth.reset.checking') }}
        </p>
      </template>

      <template v-else-if="step === 'invalid'">
        <h1 class="mt-2 text-2xl font-semibold tracking-tight">{{ t('auth.reset.invalidTitle') }}</h1>
        <p
          role="alert"
          class="mt-6 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          {{ invalidReason }}
        </p>
        <Button as-child class="mt-4 w-full">
          <NuxtLink to="/forgot-password">{{ t('auth.reset.requestNew') }}</NuxtLink>
        </Button>
      </template>

      <template v-else-if="step === 'done'">
        <h1 class="mt-2 text-2xl font-semibold tracking-tight">{{ t('auth.reset.doneTitle') }}</h1>
        <p
          role="status"
          class="mt-6 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm"
        >
          <Icon name="lucide:circle-check" class="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <span>{{ t('auth.reset.done') }}</span>
        </p>
        <Button as-child class="mt-4 w-full">
          <NuxtLink to="/login">{{ t('auth.reset.toLogin') }}</NuxtLink>
        </Button>
      </template>

      <template v-else>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight">{{ t('auth.reset.title') }}</h1>
        <p class="mt-2 text-sm text-muted-foreground">{{ t('auth.reset.intro') }}</p>

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
            {{ pending ? t('auth.reset.submitting') : t('auth.reset.submit') }}
          </Button>
        </form>
      </template>
    </div>
  </main>
</template>
