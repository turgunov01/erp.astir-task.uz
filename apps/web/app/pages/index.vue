<script setup lang="ts">
import type { Pinia } from 'pinia'
import { useAuthStore } from '~/stores/auth'

// Entry point resolves to the session's home: own tasks for the people doing
// the work, the dashboard for everyone overseeing it. The global auth
// middleware runs first, so unauthenticated visitors land on /login instead.
definePageMeta({
  middleware: () => {
    const auth = useAuthStore(useNuxtApp().$pinia as Pinia)
    return navigateTo(auth.homePath, { redirectCode: 302 })
  }
})
</script>

<template>
  <div />
</template>
