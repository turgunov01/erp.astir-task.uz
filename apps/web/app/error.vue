<script setup lang="ts">
import type { NuxtError } from '#app'
import { Button } from '~/components/ui/button'

const props = defineProps<{ error: NuxtError }>()

const isNotFound = computed(() => props.error?.statusCode === 404)

useHead({ title: computed(() => (isNotFound.value ? 'Page not found' : 'Error') + ' — Aster ERP') })
</script>

<template>
  <div class="grid min-h-svh place-items-center px-6 py-12">
    <div class="max-w-md text-center">
      <p class="text-6xl font-semibold tabular-nums tracking-tight text-muted-foreground/40">
        {{ error?.statusCode ?? 500 }}
      </p>

      <h1 class="mt-4 text-2xl font-semibold tracking-tight">
        {{ isNotFound ? 'Страница не найдена' : 'Что-то пошло не так' }}
      </h1>

      <p class="mt-2 text-sm text-muted-foreground">
        {{ isNotFound
          ? 'Возможно, этот раздел ещё не реализован или ссылка устарела.'
          : error?.message || 'Непредвиденная ошибка сервера.' }}
      </p>

      <div class="mt-8 flex items-center justify-center gap-3">
        <Button @click="clearError({ redirect: '/dashboard' })">
          На панель управления
        </Button>
        <Button variant="ghost" @click="clearError()">
          Назад
        </Button>
      </div>
    </div>
  </div>
</template>
