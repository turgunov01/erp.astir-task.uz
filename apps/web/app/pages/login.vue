<script setup lang="ts">
import { ERROR_CODE } from '@astir/types'
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { apiErrorBody, apiErrorMessage } from '~/composables/useApi'

definePageMeta({ layout: false })
useHead({ title: 'Sign in' })

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
  await navigateTo(typeof redirect === 'string' ? redirect : '/dashboard')
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
      scheduleResend(Number(body.details?.retryAfter?.[0] ?? DEFAULT_RESEND_SECONDS))
      return
    }
    errorMessage.value = apiErrorMessage(err, 'Не удалось войти. Попробуйте ещё раз.')
  }
}

async function onVerify() {
  errorMessage.value = ''
  try {
    await auth.verifyCode(email.value, password.value, code.value)
    await enter()
  } catch (err: unknown) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось подтвердить код. Попробуйте ещё раз.')
  }
}

async function onResend() {
  if (resending.value) return
  resending.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    scheduleResend(await auth.resendCode(email.value))
    notice.value = 'Новый код отправлен на ' + email.value
  } catch (err: unknown) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось отправить код. Попробуйте ещё раз.')
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
    <div class="flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <div class="mb-10">
          <p class="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {{ brand.name }}
          </p>
          <template v-if="step === 'code'">
            <h1 class="mt-2 text-3xl font-semibold tracking-tight">
              Подтвердите почту
            </h1>
            <p class="mt-2 text-sm text-muted-foreground">
              Первый вход: нужно доказать, что адрес ваш.
            </p>
          </template>
          <template v-else>
            <h1 class="mt-2 text-3xl font-semibold tracking-tight">
              Sign in
            </h1>
            <p class="mt-2 text-sm text-muted-foreground">
              Production ERP for the studio pipeline.
            </p>
          </template>
        </div>

        <form v-if="step === 'code'" class="space-y-5" @submit.prevent="onVerify">
          <p class="rounded-md border bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
            Мы отправили шестизначный код на
            <span class="font-medium">{{ email }}</span>.
            Он действует 15 минут.
          </p>

          <div class="space-y-2">
            <Label for="code">Код из письма</Label>
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
            {{ auth.pending ? 'Проверяем...' : 'Подтвердить и войти' }}
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
              Назад
            </button>
            <button
              type="button"
              :disabled="resendIn > 0 || resending || auth.pending"
              class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-60"
              @click="onResend"
            >
              {{ resendIn > 0 ? 'Отправить ещё раз через ' + resendIn + ' с' : 'Отправить код ещё раз' }}
            </button>
          </div>
        </form>

        <form v-else class="space-y-5" @submit.prevent="onSubmit">
          <div class="space-y-2">
            <Label for="email">Email</Label>
            <Input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="owner@aster.studio"
              required
            />
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label for="password">Password</Label>
              <NuxtLink
                to="/forgot-password"
                class="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
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
            {{ auth.pending ? 'Signing in...' : 'Sign in' }}
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
          Полная прозрачность производства — от проекта до последней
          утверждённой версии шота.
        </blockquote>
        <div class="mt-8 flex flex-wrap gap-2">
          <span
            v-for="stage in ['Shot', 'Stage', 'Version', 'Review', 'Delivery']"
            :key="stage"
            class="rounded-md bg-primary-foreground/10 px-2.5 py-1 text-xs font-medium text-primary-foreground/80"
          >
            {{ stage }}
          </span>
        </div>
      </div>
    </aside>
  </main>
</template>
