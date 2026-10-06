<script setup lang="ts">
import { useBrand } from '~/composables/useBrand'

// Loaded once per page load by plugins/locale.ts, together with the language.
const brand = useBrand()

// Pages set only their own part of the title (through t(), so it follows the
// language); the instance name is appended here, once, so renaming the
// studio renames every tab.
useHead({
  titleTemplate: title => (title ? title + ' — ' + brand.value.name : brand.value.name)
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
