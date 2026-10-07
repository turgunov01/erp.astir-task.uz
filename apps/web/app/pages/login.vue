<script setup lang="ts">
import { ERROR_CODE } from '@astir/types'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { apiErrorBody, apiErrorMessage } from '~/composables/useApi'
import LocaleSelect from '~/components/locale/LocaleSelect.vue'
import type { Locale } from '@astir/types'

definePageMeta({ layout: false })

const { t } = useI18n()
useHead({ title: computed(() => t('auth.login.pageTitle')) })

/* Nobody is known yet: the choice goes to the cookie and the API reads it. */
const { current: currentLocale, chooseAsGuest } = useAppLocale()
const language = computed({
  get: () => currentLocale.value,
  set: (code: Locale | null) => { if (code) void chooseAsGuest(code) }
})

const auth = useAuthStore()
const route = useRoute()
const brand = useBrand()

const email = ref('')
const password = ref('')
const errorMessage = ref('')

/*
 * A first login stops at the emailed code (EMAIL_NOT_VERIFIED).
 *
 * The credentials stay in memory across the step because the API checks them
 * again together with the code; they go nowhere else.
 */
const step = ref<'credentials' | 'code'>('credentials')
const code = ref('')
/** A manager moved the login to this address: the step says so instead of "first login". */
const emailChanged = ref(false)
const notice = ref('')
const resending = ref(false)
/** When another code may be requested; the resend button counts down to it. */
const resendAt = ref(0)
const now = useNow({ interval: 1000 })
const resendIn = computed(() =>
  Math.max(0, Math.ceil((resendAt.value - now.value.getTime()) / 1000))
)

const DEFAULT_RESEND_SECONDS = 60

function scheduleResend(seconds: number) {
  resendAt.value = Date.now() + seconds * 1000
}

async function enter() {
  const redirect = route.query.redirect
  await navigateTo(typeof redirect === 'string' ? redirect : auth.homePath)
}

async function onSubmit() {
  errorMessage.value = ''
  try {
    await auth.login(email.value, password.value)
    await enter()
  } catch (err: unknown) {
    const body = apiErrorBody(err)
    if (body?.code === ERROR_CODE.EMAIL_NOT_VERIFIED) {
      step.value = 'code'
      code.value = ''
      notice.value = ''
      emailChanged.value = body.details?.emailChanged?.[0] === 'true'
      scheduleResend(Number(body.details?.retryAfter?.[0] ?? DEFAULT_RESEND_SECONDS))
      return
    }
    errorMessage.value = apiErrorMessage(err, t('auth.login.failed'))
  }
}

async function onVerify() {
  errorMessage.value = ''
  try {
    await auth.verifyCode(email.value, password.value, code.value)
    await enter()
  } catch (err: unknown) {
    errorMessage.value = apiErrorMessage(err, t('auth.code.verifyFailed'))
  }
}

async function onResend() {
  if (resending.value) return
  resending.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    scheduleResend(await auth.resendCode(email.value))
    notice.value = t('auth.code.resent', { email: email.value })
  } catch (err: unknown) {
    errorMessage.value = apiErrorMessage(err, t('auth.code.resendFailed'))
  } finally {
    resending.value = false
  }
}

function back() {
  step.value = 'credentials'
  code.value = ''
  errorMessage.value = ''
  notice.value = ''
}
</script>

<template>
  <main class="grid min-h-svh lg:grid-cols-2">
    <!-- Form side -->
    <div class="relative flex items-center justify-center px-6 py-12">
      <!-- Before signing in the language is the visitor's to pick (cookie only). -->
      <div class="absolute right-4 top-4">
        <LocaleSelect v-model="language" compact :aria-label="t('shell.language.label')" />
      </div>
      <div class="w-full max-w-sm">
        <div class="mb-10">
          <p class="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {{ brand.name }}
          </p>
          <template v-if="step === 'code'">
            <h1 class="mt-2 text-3xl font-semibold tracking-tight">
              {{ emailChanged ? t('auth.code.changedTitle') : t('auth.code.title') }}
            </h1>
            <p class="mt-2 text-sm text-muted-foreground">
              {{ emailChanged ? t('auth.code.changedSubtitle') : t('auth.code.subtitle') }}
            </p>
          </template>
          <template v-else>
            <h1 class="mt-2 text-3xl font-semibold tracking-tight">
              {{ t('auth.login.title') }}
            </h1>
            <p class="mt-2 text-sm text-muted-foreground">
              {{ t('auth.login.subtitle') }}
            </p>
          </template>
        </div>

        <form v-if="step === 'code'" class="space-y-5" @submit.prevent="onVerify">
          <!-- The address stays bold wherever the language puts it in the sentence. -->
          <i18n-t
            :keypath="emailChanged ? 'auth.code.changedSentTo' : 'auth.code.sentTo'"
            tag="p"
            scope="global"
            class="rounded-md border bg-secondary px-3 py-2.5 text-sm text-secondary-foreground"
          >
            <template #email>
              <span class="font-medium">{{ email }}</span>
            </template>
          </i18n-t>

          <div class="space-y-2">
            <Label for="code">{{ t('auth.code.label') }}</Label>
            <Input
              id="code"
              v-model="code"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]{6}"
              maxlength="6"
              placeholder="000000"
              class="text-center text-lg tracking-[0.5em]"
              autofocus
              required
            />
          </div>

          <p
            v-if="notice"
            role="status"
            class="rounded-md border bg-secondary px-3 py-2 text-sm text-secondary-foreground"
          >
            {{ notice }}
          </p>

          <p
            v-if="errorMessage"
            role="alert"
            class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {{ errorMessage }}
          </p>

          <Button
            type="submit"
            class="w-full"
            :disabled="auth.pending || String(code).length !== 6"
          >
            {{ auth.pending
              ? t('auth.code.submitting')
              : emailChanged ? t('auth.code.changedSubmit') : t('auth.code.submit') }}
          </Button>

          <!--
            Both forms share errorMessage, so leaving the step while a check
            is still in flight would land its verdict on the wrong form.
          -->
          <div class="flex items-center justify-between text-sm">
            <button
              type="button"
              :disabled="auth.pending"
              class="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-60"
              @click="back"
            >
              <Icon name="lucide:arrow-left" class="size-3.5" />
              {{ t('auth.code.back') }}
            </button>
            <button
              type="button"
              :disabled="resendIn > 0 || resending || auth.pending"
              class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-60"
              @click="onResend"
            >
              {{ resendIn > 0 ? t('auth.code.resendIn', { n: resendIn }) : t('auth.code.resend') }}
            </button>
          </div>
        </form>

        <form v-else class="space-y-5" @submit.prevent="onSubmit">
          <div class="space-y-2">
            <Label for="email">{{ t('auth.login.email') }}</Label>
            <Input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              :placeholder="t('auth.login.emailPlaceholder')"
              required
            />
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label for="password">{{ t('auth.login.password') }}</Label>
              <NuxtLink
                to="/forgot-password"
                class="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {{ t('auth.login.forgot') }}
              </NuxtLink>
            </div>
            <Input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
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

          <Button type="submit" class="w-full" :disabled="auth.pending">
            {{ auth.pending ? t('auth.login.submitting') : t('auth.login.submit') }}
          </Button>
        </form>
      </div>
    </div>

    <!-- Brand side -->
    <aside class="relative hidden overflow-hidden bg-primary lg:block">
      <div class="absolute inset-0 opacity-90">
        <div class="absolute -left-24 top-1/4 size-96 rounded-full bg-signal/20 blur-3xl" />
        <div class="absolute -right-16 bottom-1/4 size-80 rounded-full bg-signal/10 blur-3xl" />
      </div>
      <div class="relative flex h-full flex-col justify-end p-14">
        <blockquote class="max-w-md text-2xl font-medium leading-snug text-primary-foreground">
          {{ t('auth.login.quote') }}
        </blockquote>
        <div class="mt-8 flex flex-wrap gap-2">
          <span
            v-for="stage in ['shot', 'stage', 'version', 'review', 'delivery']"
            :key="stage"
            class="rounded-md bg-primary-foreground/10 px-2.5 py-1 text-xs font-medium text-primary-foreground/80"
          >
            {{ t('auth.login.stages.' + stage) }}
          </span>
        </div>
      </div>
    </aside>
  </main>
</template>
