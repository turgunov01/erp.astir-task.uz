<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'

definePageMeta({ layout: false })

const { t } = useI18n()
useHead({ title: computed(() => t('auth.forgot.title')) })

const brand = useBrand()

const email = ref('')
const pending = ref(false)
const submitted = ref(false)
const errorMessage = ref('')

/*
 * The API answers the same for every address, registered or not, so the
 * success state is worded as "if it exists". Only a request that never got an
 * answer (network, validation) is shown as a failure.
 */
async function onSubmit() {
  if (pending.value) return
  pending.value = true
  errorMessage.value = ''
  try {
    await apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value.trim() }
    })
    submitted.value = true
  } catch (err: unknown) {
    errorMessage.value = apiErrorMessage(err, t('auth.forgot.failed'))
  } finally {
    pending.value = false
  }
}

function useAnotherAddress() {
  submitted.value = false
  errorMessage.value = ''
}
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
      <h1 class="mt-2 text-2xl font-semibold tracking-tight">{{ t('auth.forgot.title') }}</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ t('auth.forgot.intro') }}
      </p>

      <div v-if="submitted" class="mt-6 space-y-4">
        <div
          role="status"
          class="rounded-md border bg-secondary px-3 py-3 text-sm text-secondary-foreground"
        >
          <p class="flex items-start gap-2 font-medium">
            <Icon name="lucide:mail-check" class="mt-0.5 size-4 shrink-0" />
            <span>{{ t('auth.forgot.sent') }}</span>
          </p>
          <p class="mt-2 text-muted-foreground">{{ t('auth.forgot.sentHint') }}</p>
        </div>
        <button
          type="button"
          class="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          @click="useAnotherAddress"
        >
          {{ t('auth.forgot.otherEmail') }}
        </button>
      </div>

      <form v-else class="mt-6 space-y-4" @submit.prevent="onSubmit">
        <div class="space-y-2">
          <Label for="email">{{ t('auth.forgot.email') }}</Label>
          <Input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            autofocus
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
          {{ pending ? t('auth.forgot.submitting') : t('auth.forgot.submit') }}
        </Button>
      </form>
    </div>
  </main>
</template>
