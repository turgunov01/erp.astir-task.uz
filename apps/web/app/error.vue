<script setup lang="ts">
import type { NuxtError } from '#app'
import { Button } from '~/components/ui/button'
import { useAuthStore } from '~/stores/auth'

const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()
const auth = useAuthStore()

const status = computed(() => props.error?.statusCode ?? 500)
const isNotFound = computed(() => status.value === 404)
const isForbidden = computed(() => status.value === 403)

const title = computed(() => {
  if (isNotFound.value) return t('shell.errorPage.notFoundTitle')
  if (isForbidden.value) return t('shell.errorPage.forbiddenTitle')
  return t('shell.errorPage.somethingWrong')
})

useHead({
  title: computed(() => (isNotFound.value ? t('shell.errorPage.notFoundTitle') : t('shell.errorPage.errorTitle')))
})

/**
 * What happened, in the interface language.
 *
 * The framework and the network word their own errors (in English), so the
 * page says it itself by status rather than repeating error.message.
 */
const message = computed(() => {
  if (isNotFound.value) return t('shell.errorPage.notFoundBody')
  if (isForbidden.value) return t('shell.errorPage.forbiddenBody')
  return t('shell.errorPage.unexpected')
})

/** Where this session starts, not a page the user may not be allowed to open. */
const startPath = computed(() => (auth.isAuthenticated ? auth.homePath : '/login'))
</script>

<template>
  <div class="grid min-h-svh place-items-center px-6 py-12">
    <div class="max-w-md text-center">
      <p class="text-6xl font-semibold tabular-nums tracking-tight text-muted-foreground/40">
        {{ status }}
      </p>

      <h1 class="mt-4 text-2xl font-semibold tracking-tight">
        {{ title }}
      </h1>

      <p class="mt-2 text-sm text-muted-foreground">
        {{ message }}
      </p>

      <div class="mt-8 flex items-center justify-center gap-3">
        <Button @click="clearError({ redirect: startPath })">
          {{ t('shell.errorPage.toStart') }}
        </Button>
        <Button variant="ghost" @click="clearError()">
          {{ t('shell.errorPage.back') }}
        </Button>
      </div>
    </div>
  </div>
</template>
