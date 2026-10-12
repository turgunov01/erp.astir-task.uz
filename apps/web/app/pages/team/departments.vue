<script setup lang="ts">
import DepartmentsManager from '~/components/team/DepartmentsManager.vue'

const { t } = useI18n()

useHead({ title: computed(() => t('team.departments.title')) })
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{{ t('team.eyebrow') }}</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('team.departments.title') }}</h1>
    </header>

    <DepartmentsManager />
  </div>
</template>
