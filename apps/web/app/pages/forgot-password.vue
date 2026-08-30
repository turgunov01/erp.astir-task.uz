<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

definePageMeta({ layout: false })
useHead({ title: 'Reset password — Aster ERP' })

const email = ref('')
const submitted = ref(false)

// Delivery lands with the notification module (phase 7). The form already
// behaves correctly and always reports success so it cannot be used to
// enumerate which emails are registered.
function onSubmit() {
  submitted.value = true
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
        Back to sign in
      </NuxtLink>

      <h1 class="mt-6 text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Enter your email and we will send a reset link.
      </p>

      <p
        v-if="submitted"
        class="mt-6 rounded-md border bg-secondary px-3 py-2.5 text-sm text-secondary-foreground"
      >
        If an account exists for that address, a reset link is on its way.
      </p>

      <form v-else class="mt-6 space-y-4" @submit.prevent="onSubmit">
        <div class="space-y-2">
          <Label for="email">Email</Label>
          <Input id="email" v-model="email" type="email" autocomplete="email" required />
        </div>
        <Button type="submit" class="w-full">Send reset link</Button>
      </form>
    </div>
  </main>
</template>
