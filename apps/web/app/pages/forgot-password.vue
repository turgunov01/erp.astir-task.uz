<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

definePageMeta({ layout: false })
useHead({ title: 'Восстановление пароля' })

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
        Назад ко входу
      </NuxtLink>

      <h1 class="mt-6 text-2xl font-semibold tracking-tight">Восстановление пароля</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Укажите рабочую почту — мы пришлём ссылку для сброса пароля.
      </p>

      <p
        v-if="submitted"
        class="mt-6 rounded-md border bg-secondary px-3 py-2.5 text-sm text-secondary-foreground"
      >
        Если такой адрес есть в системе, письмо со ссылкой уже в пути.
      </p>

      <form v-else class="mt-6 space-y-4" @submit.prevent="onSubmit">
        <div class="space-y-2">
          <Label for="email">Почта</Label>
          <Input id="email" v-model="email" type="email" autocomplete="email" required />
        </div>
        <Button type="submit" class="w-full">Отправить ссылку</Button>
      </form>
    </div>
  </main>
</template>
