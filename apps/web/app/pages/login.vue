<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { apiErrorMessage } from '~/composables/useApi'

definePageMeta({ layout: false })
useHead({ title: 'Sign in — Aster ERP' })

const auth = useAuthStore()
const route = useRoute()

const email = ref('')
const password = ref('')
const errorMessage = ref('')

async function onSubmit() {
  errorMessage.value = ''
  try {
    await auth.login(email.value, password.value)
    const redirect = route.query.redirect
    await navigateTo(typeof redirect === 'string' ? redirect : '/dashboard')
  } catch (err: unknown) {
    errorMessage.value = apiErrorMessage(err, 'Не удалось войти. Попробуйте ещё раз.')
  }
}
</script>

<template>
  <main class="grid min-h-svh lg:grid-cols-2">
    <!-- Form side -->
    <div class="flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <div class="mb-10">
          <p class="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Aster Animation Studio
          </p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight">
            Sign in
          </h1>
          <p class="mt-2 text-sm text-muted-foreground">
            Production ERP for the studio pipeline.
          </p>
        </div>

        <form class="space-y-5" @submit.prevent="onSubmit">
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
            v-for="step in ['Shot', 'Stage', 'Version', 'Review', 'Delivery']"
            :key="step"
            class="rounded-md bg-primary-foreground/10 px-2.5 py-1 text-xs font-medium text-primary-foreground/80"
          >
            {{ step }}
          </span>
        </div>
      </div>
    </aside>
  </main>
</template>
