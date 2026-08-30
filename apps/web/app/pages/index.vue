<script setup lang="ts">
// Entry point resolves to the dashboard. The global auth middleware runs
// first, so unauthenticated visitors land on /login instead.
definePageMeta({
  middleware: () => navigateTo('/dashboard', { redirectCode: 302 })
})
</script>

<template>
  <div />
</template>
