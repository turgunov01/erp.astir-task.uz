<script setup lang="ts">
import { useBrand } from '~/composables/useBrand'

const brand = useBrand()

const { data } = await useFetch<{ data: { name: string, logoUrl: string | null } }>(
  '/api/settings/brand',
  { credentials: 'include' }
)
if (data.value?.data) brand.value = data.value.data

// Pages set only their own part of the title; the instance name is appended
// here, once, so renaming the studio renames every tab.
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
